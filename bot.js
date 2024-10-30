import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Constants
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Track match states
const matchStates = new Map();

// Match state class to track votes and match status
class MatchState {
    constructor(matchId) {
        this.matchId = matchId;
        this.rehostVotes = new Set();
        this.cancelVotes = new Set();
        this.welcomeSent = false;
    }

    addRehostVote(userId) {
        if (!this.rehostVotes.has(userId)) {
            this.rehostVotes.add(userId);
            return true;
        }
        return false;
    }

    addCancelVote(userId) {
        if (!this.cancelVotes.has(userId)) {
            this.cancelVotes.add(userId);
            return true;
        }
        return false;
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

// Send message to match room
async function sendMatchMessage(matchId, message) {
    try {
        console.log(`Sending message to match ${matchId}: ${message}`);
        
        // Use the Data API to send the message
        const response = await faceitDataApi.post(`/matches/${matchId}/messages`, {
            message: message,
            type: "system"
        });
        
        console.log('Message sent successfully. Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error sending message:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Test API connection
async function testApiConnection() {
    try {
        console.log('Testing API connection...');
        const response = await faceitDataApi.get(`/hubs/${FACEIT_HUB_ID}`);
        console.log('API connection successful:', response.data.name);
        return true;
    } catch (error) {
        console.error('API connection test failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        return false;
    }
}

async function getMatchDetails(matchId) {
    try {
        console.log(`Fetching details for match ${matchId}`);
        const response = await faceitDataApi.get(`/matches/${matchId}`);
        console.log('Match details response:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error('Error fetching match details:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function getHubMatches() {
    try {
        console.log(`Fetching matches for hub ${FACEIT_HUB_ID}`);
        const response = await faceitDataApi.get(`/hubs/${FACEIT_HUB_ID}/matches`, {
            params: {
                type: 'ongoing',
                offset: 0,
                limit: 20
            }
        });

        if (!response.data || typeof response.data !== 'object') {
            console.error('Invalid API response:', response.data);
            return [];
        }

        const matches = response.data.items || [];
        console.log(`Found ${matches.length} matches:`, JSON.stringify(matches, null, 2));
        return matches;
    } catch (error) {
        console.error('Error fetching hub matches:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        return [];
    }
}

async function calculateTeamElos(matchDetails) {
    try {
        const teams = matchDetails.teams || {};
        const faction1 = teams.faction1 || { roster: [] };
        const faction2 = teams.faction2 || { roster: [] };

        // Calculate average elos
        const team1Elo = faction1.roster.reduce((sum, player) => sum + (player.elo || 0), 0) / faction1.roster.length;
        const team2Elo = faction2.roster.reduce((sum, player) => sum + (player.elo || 0), 0) / faction2.roster.length;
        
        const result = {
            team1Elo,
            team2Elo,
            differential: Math.abs(team1Elo - team2Elo)
        };

        console.log('Calculated elos:', result);
        return result;
    } catch (error) {
        console.error('Error calculating team elos:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Check if user is a player in the match
function isPlayerInMatch(matchDetails, userId) {
    try {
        console.log('Checking if user is in match. User ID:', userId);
        console.log('Match details:', JSON.stringify(matchDetails, null, 2));
        
        const teams = matchDetails.teams || {};
        const faction1Players = teams.faction1?.roster?.map(player => player.player_id) || [];
        const faction2Players = teams.faction2?.roster?.map(player => player.player_id) || [];
        
        console.log('Faction 1 players:', faction1Players);
        console.log('Faction 2 players:', faction2Players);
        
        const isPlayer = faction1Players.includes(userId) || faction2Players.includes(userId);
        console.log('Is player in match:', isPlayer);
        
        return isPlayer;
    } catch (error) {
        console.error('Error checking if player is in match:', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// Handle rehost command
async function handleRehost(matchId, userId) {
    console.log(`Processing rehost command. Match ID: ${matchId}, User ID: ${userId}`);
    
    const matchState = matchStates.get(matchId);
    if (!matchState) {
        console.log('Match state not found');
        await sendMatchMessage(matchId, "Cannot process rehost - match state not found.");
        return;
    }

    try {
        const matchDetails = await getMatchDetails(matchId);
        if (!isPlayerInMatch(matchDetails, userId)) {
            console.log('User is not a player in the match');
            await sendMatchMessage(matchId, "Only match players can vote to rehost.");
            return;
        }

        if (matchState.addRehostVote(userId)) {
            const votesNeeded = REHOST_VOTE_COUNT - matchState.getRehostVoteCount();
            console.log(`Rehost vote added. Votes needed: ${votesNeeded}`);
            await sendMatchMessage(matchId, `Rehost vote added. ${votesNeeded} more vote${votesNeeded === 1 ? '' : 's'} needed.`);

            if (matchState.getRehostVoteCount() >= REHOST_VOTE_COUNT) {
                try {
                    console.log('Initiating match rehost');
                    await faceitDataApi.post(`/matches/${matchId}/rehost`);
                    await sendMatchMessage(matchId, "Match is being rehosted...");
                    matchState.clearVotes();
                } catch (error) {
                    console.error('Error rehosting match:', {
                        status: error.response?.status,
                        data: error.response?.data,
                        message: error.message,
                        stack: error.stack
                    });
                    await sendMatchMessage(matchId, "Failed to rehost the match. Please try again.");
                }
            }
        }
    } catch (error) {
        console.error('Error handling rehost:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        await sendMatchMessage(matchId, "Error processing rehost vote. Please try again.");
    }
}

// Handle cancel command
async function handleCancel(matchId, userId) {
    console.log(`Processing cancel command. Match ID: ${matchId}, User ID: ${userId}`);
    
    const matchState = matchStates.get(matchId);
    if (!matchState) {
        console.log('Match state not found');
        await sendMatchMessage(matchId, "Cannot process cancel - match state not found.");
        return;
    }

    try {
        const matchDetails = await getMatchDetails(matchId);
        if (!isPlayerInMatch(matchDetails, userId)) {
            console.log('User is not a player in the match');
            await sendMatchMessage(matchId, "Only match players can vote to cancel.");
            return;
        }

        if (matchState.addCancelVote(userId)) {
            const votesNeeded = REHOST_VOTE_COUNT - matchState.getCancelVoteCount();
            console.log(`Cancel vote added. Votes needed: ${votesNeeded}`);
            await sendMatchMessage(matchId, `Cancel vote added. ${votesNeeded} more vote${votesNeeded === 1 ? '' : 's'} needed.`);

            if (matchState.getCancelVoteCount() >= REHOST_VOTE_COUNT) {
                try {
                    console.log('Initiating match cancellation');
                    await faceitDataApi.post(`/matches/${matchId}/cancel`);
                    await sendMatchMessage(matchId, "Match is being cancelled...");
                    matchState.clearVotes();
                } catch (error) {
                    console.error('Error cancelling match:', {
                        status: error.response?.status,
                        data: error.response?.data,
                        message: error.message,
                        stack: error.stack
                    });
                    await sendMatchMessage(matchId, "Failed to cancel the match. Please try again.");
                }
            }
        }
    } catch (error) {
        console.error('Error handling cancel:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
        await sendMatchMessage(matchId, "Error processing cancel vote. Please try again.");
    }
}

async function pollMatches() {
    try {
        const matches = await getHubMatches();
        
        if (!Array.isArray(matches)) {
            console.error('Invalid matches data:', matches);
            return;
        }

        console.log(`Processing ${matches.length} matches`);
        
        for (const match of matches) {
            if (!match.match_id) {
                console.log('Invalid match object:', match);
                continue;
            }

            console.log(`Processing match: ${match.match_id} (Status: ${match.status})`);

            if (match.status === 'READY' || match.status === 'ONGOING') {
                let matchState = matchStates.get(match.match_id);
                
                if (!matchState) {
                    console.log(`New match detected: ${match.match_id}`);
                    matchState = new MatchState(match.match_id);
                    matchStates.set(match.match_id, matchState);
                    
                    try {
                        const matchDetails = await getMatchDetails(match.match_id);
                        const elos = await calculateTeamElos(matchDetails);
                        
                        console.log(`Match ${match.match_id}:`, {
                            teams: matchDetails.teams,
                            eloDiff: elos.differential
                        });

                        // Send welcome message for new matches
                        if (!matchState.welcomeSent) {
                            await sendMatchMessage(match.match_id, 
                                "Welcome to the match! 🎮\n" +
                                "Available commands:\n" +
                                "!rehost - Vote to rehost the match (match players only)\n" +
                                "!cancel - Vote to cancel the match (match players only)"
                            );
                            matchState.welcomeSent = true;
                        }
                    } catch (error) {
                        console.error(`Error processing match ${match.match_id}:`, {
                            status: error.response?.status,
                            data: error.response?.data,
                            message: error.message,
                            stack: error.stack
                        });
                    }
                }
            } else if (match.status === 'FINISHED' || match.status === 'CANCELLED') {
                if (matchStates.has(match.match_id)) {
                    console.log(`Cleaning up completed match: ${match.match_id}`);
                    matchStates.delete(match.match_id);
                }
            }
        }
    } catch (error) {
        console.error('Error in pollMatches:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });
    }
}

// Express server setup
const app = express();
const port = process.env.PORT || 3000;

// Add CORS middleware
app.use(cors());

// Add JSON body parser middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        query: req.query
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeMatches: matchStates.size,
        uptime: process.uptime()
    });
});

// FACEIT webhook callback endpoint
app.post('/callback', async (req, res) => {
    try {
        console.log('Received webhook callback:', {
            headers: req.headers,
            body: req.body
        });

        const { message, user_id, match_id } = req.body;
        
        if (!message || !user_id || !match_id) {
            console.error('Missing required fields in webhook payload:', req.body);
            return res.status(400).json({ error: 'Invalid payload' });
        }

        console.log('Processing chat message:', {
            match_id,
            user_id,
            message
        });

        // Ensure match state exists
        if (!matchStates.has(match_id)) {
            console.log(`Creating new match state for ${match_id}`);
            const matchState = new MatchState(match_id);
            matchStates.set(match_id, matchState);
            
            try {
                // Initialize match state
                const matchDetails = await getMatchDetails(match_id);
                console.log('Match details:', matchDetails);
                
                // Send welcome message if this is a new match
                if (!matchState.welcomeSent) {
                    await sendMatchMessage(match_id, 
                        "Welcome to the match! 🎮\n" +
                        "Available commands:\n" +
                        "!rehost - Vote to rehost the match (match players only)\n" +
                        "!cancel - Vote to cancel the match (match players only)"
                    );
                    matchState.welcomeSent = true;
                }
            } catch (error) {
                console.error('Error initializing match state:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                    stack: error.stack
                });
                // Continue processing even if initialization fails
            }
        }

        // Process commands
        const command = message.trim().toLowerCase();
        if (command === '!rehost') {
            await handleRehost(match_id, user_id);
        } else if (command === '!cancel') {
            await handleCancel(match_id, user_id);
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error processing webhook:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server and test API connection
app.listen(port, async () => {
    console.log(`Bot is running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('ELO threshold:', ELO_THRESHOLD);
    console.log('Required rehost votes:', REHOST_VOTE_COUNT);
    console.log('FACEIT Hub ID:', FACEIT_HUB_ID);
    
    // Test API connection before starting polling
    const apiConnected = await testApiConnection();
    if (apiConnected) {
        console.log('Starting match polling...');
        // Initial poll
        await pollMatches();
        
        // Start polling interval
        setInterval(pollMatches, 30000);
    } else {
        console.error('Failed to connect to FACEIT API. Please check your API key and permissions.');
        process.exit(1);
    }
});
