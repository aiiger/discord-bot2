import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Track match states
const matchStates = new Map();

class MatchState {
    constructor(matchId) {
        this.matchId = matchId;
        this.rehostVotes = new Set();
        this.cancelVotes = new Set();
    }

    addRehostVote(userId) {
        this.rehostVotes.add(userId);
    }

    addCancelVote(userId) {
        this.cancelVotes.add(userId);
    }

    getRehostVoteCount() {
        return this.rehostVotes.size;
    }

    getCancelVoteCount() {
        return this.cancelVotes.size;
    }

    clearVotes() {
        this.rehostVotes.clear();
        this.cancelVotes.clear();
    }
}

// API client setup for Data API
const faceitDataApi = axios.create({
    baseURL: 'https://open.faceit.com/data/v4',
    headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`
    }
});

// API client setup for Chat API
const faceitChatApi = axios.create({
    baseURL: 'https://open.faceit.com/chat/v1',
    headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`
    }
});

// Send message to match room
async function sendMatchMessage(matchId, message) {
    try {
        const response = await faceitChatApi.post(`/rooms/${matchId}/messages`, { message });
        console.log(`Message sent to match ${matchId}: ${message}`);
    } catch (error) {
        console.error(`Error sending message to match ${matchId}:`, error.response?.data || error.message);
    }
}

// Test API connection
async function testApiConnection() {
    try {
        const response = await faceitDataApi.get('/hubs');
        console.log('API connection successful:', response.data);
    } catch (error) {
        console.error('Error testing API connection:', error.response?.data || error.message);
    }
}

async function getMatchDetails(matchId) {
    try {
        const response = await faceitDataApi.get(`/matches/${matchId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching match details for ${matchId}:`, error.response?.data || error.message);
        throw error;
    }
}

async function getHubMatches() {
    try {
        const response = await faceitDataApi.get(`/hubs/${FACEIT_HUB_ID}/matches?type=ongoing&offset=0&limit=20`);
        return response.data.items || [];
    } catch (error) {
        console.error('Error fetching hub matches:', error.response?.data || error.message);
        return [];
    }
}

async function calculateTeamElos(matchDetails) {
    try {
        const faction1 = matchDetails.teams.faction1;
        const faction2 = matchDetails.teams.faction2;

        const faction1Rating = parseFloat(faction1.stats.rating);
        const faction2Rating = parseFloat(faction2.stats.rating);

        if (isNaN(faction1Rating) || isNaN(faction2Rating)) {
            console.log('Invalid ratings detected, skipping match');
            return null;
        }

        return {
            faction1Rating,
            faction2Rating,
            ratingDiff: Math.abs(faction1Rating - faction2Rating)
        };
    } catch (error) {
        console.error('Error calculating team ELOs:', error.message);
        return null;
    }
}

// Check if user is a player in the match
function isPlayerInMatch(matchDetails, userId) {
    const teams = matchDetails.teams || {};
    const faction1Players = teams.faction1?.roster?.map(player => player.id) || [];
    const faction2Players = teams.faction2?.roster?.map(player => player.id) || [];

    return faction1Players.includes(userId) || faction2Players.includes(userId);
}

// Handle rehost command
async function handleRehost(matchId, userId) {
    console.log(`Processing rehost command. Match ID: ${matchId}, User ID: ${userId}`);
    const matchState = matchStates.get(matchId);

    if (!matchState) {
        console.error(`Match state not found for match ID: ${matchId}`);
        return;
    }

    matchState.addRehostVote(userId);
    const voteCount = matchState.getRehostVoteCount();

    if (voteCount >= REHOST_VOTE_COUNT) {
        console.log(`Rehost vote count reached for match ${matchId}. Sending rehost message.`);
        await sendMatchMessage(matchId, 'Rehost conditions met. Rehosting the match.');
        matchState.clearVotes();
    } else {
        console.log(`Rehost vote added for match ${matchId}. Current count: ${voteCount}`);
    }
}

// Handle cancel command
async function handleCancel(matchId, userId) {
    console.log(`Processing cancel command. Match ID: ${matchId}, User ID: ${userId}`);
    const matchState = matchStates.get(matchId);

    if (!matchState) {
        console.error(`Match state not found for match ID: ${matchId}`);
        return;
    }

    matchState.addCancelVote(userId);
    const voteCount = matchState.getCancelVoteCount();

    if (voteCount >= REHOST_VOTE_COUNT) {
        console.log(`Cancel vote count reached for match ${matchId}. Sending cancel message.`);
        await sendMatchMessage(matchId, 'Cancel conditions met. Cancelling the match.');
        matchState.clearVotes();
    } else {
        console.log(`Cancel vote added for match ${matchId}. Current count: ${voteCount}`);
    }
}

async function pollMatches() {
    try {
        const matches = await getHubMatches();
        console.log(`\nProcessing ${matches.length} matches`);

        for (const match of matches) {
            const matchDetails = await getMatchDetails(match.match_id);
            const elos = await calculateTeamElos(matchDetails);

            if (elos && elos.ratingDiff > ELO_THRESHOLD) {
                console.log(`High ELO difference detected for match ${match.match_id}`);
                await sendMatchMessage(match.match_id, `High ELO difference detected: ${elos.ratingDiff} points`);
            }

            // Greet players when a new match starts
            if (!matchStates.has(match.match_id)) {
                await sendMatchMessage(match.match_id, 'Welcome to the match! 🎮\nAvailable commands:\n!rehost - Vote to rehost the match\n!cancel - Vote to cancel the match');
                matchStates.set(match.match_id, new MatchState(match.match_id));
            }
        }
    } catch (error) {
        console.error('Error polling matches:', error.message);
    }
}

// Express server setup
const app = express();
const port = process.env.PORT || 3000;

// Add JSON body parser middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', req.method, req.url, req.body);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', activeMatches: matchStates.size, uptime: process.uptime() });
});

// FACEIT webhook callback endpoint
app.post('/callback', async (req, res) => {
    try {
        const { match_id, message, user_id } = req.body;

        if (!match_id || !message || !user_id) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        let matchState = matchStates.get(match_id);

        if (!matchState) {
            const matchDetails = await getMatchDetails(match_id);
            matchState = new MatchState(match_id);
            matchStates.set(match_id, matchState);
            await sendMatchMessage(match_id, 'Welcome to the match! 🎮\nAvailable commands:\n!rehost - Vote to rehost the match\n!cancel - Vote to cancel the match');
        }

        if (!isPlayerInMatch(matchState, user_id)) {
            return res.status(403).json({ error: 'Only match players can vote' });
        }

        if (message === '!rehost') {
            await handleRehost(match_id, user_id);
        } else if (message === '!cancel') {
            await handleCancel(match_id, user_id);
        } else {
            return res.status(400).json({ error: 'Unknown command' });
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error handling callback:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server and test API connection
app.listen(port, async () => {
    console.log(`Bot is running on port ${port}`);
    await testApiConnection();
    setInterval(pollMatches, 30000); // Poll matches every 30 seconds
});