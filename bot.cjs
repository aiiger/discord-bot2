const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Constants
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Track match states
const matchStates = new Map();

class MatchState {
    constructor(matchId, chatRoomId) {
        this.matchId = matchId;
        this.chatRoomId = chatRoomId;
        this.rehostVotes = new Set();
        this.cancelVotes = new Set();
        this.hasGreeted = false;
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

// Function to get access token
async function getAccessToken() {
    try {
        const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token', {
            grant_type: 'client_credentials',
            client_id: FACEIT_CLIENT_ID,
            client_secret: FACEIT_CLIENT_SECRET
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching access token:', error.response?.data || error.message);
        throw error;
    }
}

// Function to create API clients with the access token
async function createApiClients() {
    const accessToken = await getAccessToken();

    const faceitDataApi = axios.create({
        baseURL: 'https://open.faceit.com/data/v4',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const faceitChatApi = axios.create({
        baseURL: 'https://open.faceit.com/chat/v1',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    return { faceitDataApi, faceitChatApi };
}

// Send message to match room
async function sendMatchMessage(faceitChatApi, chatRoomId, message) {
    try {
        const response = await faceitChatApi.post(`/rooms/${chatRoomId}/messages`, { message });
        console.log(`Message sent to room ${chatRoomId}: ${message}`);
    } catch (error) {
        console.error(`Error sending message to room ${chatRoomId}:`, error.response?.data || error.message);
    }
}

// Test API connection
async function testApiConnection(faceitDataApi) {
    try {
        const response = await faceitDataApi.get('/hubs');
        console.log('API connection successful:', response.data);
    } catch (error) {
        console.error('Error testing API connection:', error.response?.data || error.message);
    }
}

async function getMatchDetails(faceitDataApi, matchId) {
    try {
        const response = await faceitDataApi.get(`/matches/${matchId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching match details for ${matchId}:`, error.response?.data || error.message);
        throw error;
    }
}

async function getHubMatches(faceitDataApi) {
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
    const faction1Players = teams.faction1?.roster?.map(player => player.player_id) || [];
    const faction2Players = teams.faction2?.roster?.map(player => player.player_id) || [];

    return faction1Players.includes(userId) || faction2Players.includes(userId);
}

// Handle rehost command
async function handleRehost(faceitChatApi, matchState, userId) {
    console.log(`Processing rehost command. Match ID: ${matchState.matchId}, User ID: ${userId}`);

    matchState.addRehostVote(userId);
    const voteCount = matchState.getRehostVoteCount();

    if (voteCount >= REHOST_VOTE_COUNT) {
        console.log(`Rehost vote count reached for match ${matchState.matchId}. Sending rehost message.`);
        await sendMatchMessage(faceitChatApi, matchState.chatRoomId, 'Rehost conditions met. Rehosting the match.');
        matchState.clearVotes();
    } else {
        console.log(`Rehost vote added for match ${matchState.matchId}. Current count: ${voteCount}`);
    }
}

// Handle cancel command
async function handleCancel(faceitChatApi, matchState, userId) {
    console.log(`Processing cancel command. Match ID: ${matchState.matchId}, User ID: ${userId}`);

    matchState.addCancelVote(userId);
    const voteCount = matchState.getCancelVoteCount();

    if (voteCount >= REHOST_VOTE_COUNT) {
        console.log(`Cancel vote count reached for match ${matchState.matchId}. Sending cancel message.`);
        await sendMatchMessage(faceitChatApi, matchState.chatRoomId, 'Cancel conditions met. Cancelling the match.');
        matchState.clearVotes();
    } else {
        console.log(`Cancel vote added for match ${matchState.matchId}. Current count: ${voteCount}`);
    }
}

async function pollMatches(faceitDataApi, faceitChatApi) {
    try {
        const matches = await getHubMatches(faceitDataApi);
        console.log(`\nProcessing ${matches.length} matches`);

        for (const match of matches) {
            const matchDetails = await getMatchDetails(faceitDataApi, match.match_id);
            const elos = await calculateTeamElos(matchDetails);

            if (elos && elos.ratingDiff > ELO_THRESHOLD) {
                console.log(`High ELO difference detected for match ${match.match_id}`);
                await sendMatchMessage(faceitChatApi, matchDetails.chat_room_id, `High ELO difference detected: ${elos.ratingDiff} points`);
            }

            let matchState = matchStates.get(match.match_id);

            if (!matchState) {
                matchState = new MatchState(match.match_id, matchDetails.chat_room_id);
                matchStates.set(match.match_id, matchState);
            }

            if (matchDetails.status === 'VOTING' && !matchState.hasGreeted) {
                await sendMatchMessage(faceitChatApi, matchDetails.chat_room_id, 'Welcome to the match! 🎮\nAvailable commands:\n!rehost - Vote to rehost the match\n!cancel - Vote to cancel the match');
                matchState.hasGreeted = true;
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
app.get('/health', async (req, res) => {
    const { faceitDataApi } = await createApiClients();
    res.json({ status: 'healthy', activeMatches: matchStates.size, uptime: process.uptime() });
});

// FACEIT webhook callback endpoint
app.post('/callback', async (req, res) => {
    try {
        const { faceitDataApi, faceitChatApi } = await createApiClients();

        const eventData = req.body;

        if (!eventData || !eventData.event || !eventData.payload) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        if (eventData.event !== 'chat_message') {
            return res.status(400).json({ error: 'Unsupported event type' });
        }

        const messageContent = eventData.payload.content;
        const userId = eventData.payload.actor_id;
        const roomId = eventData.payload.room_id;

        if (!messageContent || !userId || !roomId) {
            return res.status(400).json({ error: 'Invalid payload data' });
        }

        // Find the match state by chat room ID
        let matchState;
        for (let [matchId, state] of matchStates.entries()) {
            if (state.chatRoomId === roomId) {
                matchState = state;
                break;
            }
        }

        if (!matchState) {
            // Try to find the match based on the room ID
            const matches = await getHubMatches(faceitDataApi);
            for (const match of matches) {
                const matchDetails = await getMatchDetails(faceitDataApi, match.match_id);
                if (matchDetails.chat_room_id === roomId) {
                    matchState = matchStates.get(match.match_id);
                    if (!matchState) {
                        matchState = new MatchState(match.match_id, roomId);
                        matchStates.set(match.match_id, matchState);
                    }
                    break;
                }
            }
        }

        if (!matchState) {
            return res.status(400).json({ error: 'Match not found for the chat room' });
        }

        const matchDetails = await getMatchDetails(faceitDataApi, matchState.matchId);

        if (!isPlayerInMatch(matchDetails, userId)) {
            return res.status(403).json({ error: 'Only match players can vote' });
        }

        const message = messageContent.trim();

        if (message === '!rehost') {
            await handleRehost(faceitChatApi, matchState, userId);
        } else if (message === '!cancel') {
            await handleCancel(faceitChatApi, matchState, userId);
        } else {
            return res.status(200).json({ status: 'Message ignored' });
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error handling callback:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server and test API connection
app.listen(port, async () => {
    const { faceitDataApi, faceitChatApi } = await createApiClients();
    console.log(`Bot is running on port ${port}`);
    await testApiConnection(faceitDataApi);
    setInterval(() => pollMatches(faceitDataApi, faceitChatApi), 30000); // Poll matches every 30 seconds
});
