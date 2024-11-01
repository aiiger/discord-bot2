import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import { authenticate } from './test-bot.js';

dotenv.config();

const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Match state storage
const matchStates = new Map();

class MatchState {
    constructor(matchId, startTime) {
        this.matchId = matchId;
        this.startTime = startTime;
        this.rehostVotes = new Set();
        this.commandsEnabled = true;
    }

    canUseCommands() {
        const now = Date.now();
        const timeElapsed = now - this.startTime;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (timeElapsed > fiveMinutes) {
            this.commandsEnabled = false;
        }
        return this.commandsEnabled;
    }

    addRehostVote(playerId) {
        this.rehostVotes.add(playerId);
        return this.rehostVotes.size;
    }
}

// Add startup logging
console.log('Bot is starting...');
console.log('Checking environment variables...');

if (!FACEIT_HUB_ID) {
    console.error('ERROR: FACEIT_HUB_ID is not set in environment variables');
    process.exit(1);
}

console.log('Environment variables verified ✓');
console.log('Bot is ready to handle messages');

// Send message to room
async function sendMessage(roomId, message, accessToken) {
    try {
        console.log(`Sending message to room ${roomId}: ${message}`);
        
        const payload = {
            message: message
        };
        
        console.log('Request payload:', JSON.stringify(payload, null, 2));
        
        const response = await axios.post(`https://open.faceit.com/chat/v1/rooms/${roomId}/messages`, payload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Message sent successfully:', response.data);
        return true;
    } catch (error) {
        console.error('Error sending message:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Get match details
async function getMatchDetails(matchId, accessToken) {
    try {
        const response = await axios.get(`https://open.faceit.com/data/v4/matches/${matchId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Error getting match details:', error);
        throw error;
    }
}

// Calculate team average elo
function calculateTeamElo(team) {
    const totalElo = team.reduce((sum, player) => sum + player.elo, 0);
    return totalElo / team.length;
}

// Check if access token exists and is valid
async function getValidAccessToken() {
    const currentToken = process.env.FACEIT_ACCESS_TOKEN;
    const tokenExpiresAt = process.env.TOKEN_EXPIRES_AT;

    if (!currentToken || !tokenExpiresAt || Date.now() >= parseInt(tokenExpiresAt)) {
        console.log('No valid token found, starting authentication...');
        const tokenData = await authenticate();
        return tokenData.access_token;
    }

    return currentToken;
}

// Handle match commands
async function handleMatchCommand(matchId, command, playerId, accessToken) {
    const matchState = matchStates.get(matchId);
    
    if (!matchState || !matchState.canUseCommands()) {
        return "Commands are only available within the first 5 minutes of the match.";
    }

    switch (command.toLowerCase()) {
        case '!rehost': {
            const voteCount = matchState.addRehostVote(playerId);
            if (voteCount >= 6) {
                return "⚠️ Rehost vote passed! 6 or more players voted for rehost. Please wait for admin assistance.";
            } else {
                return `Rehost vote registered (${voteCount}/6 votes)`;
            }
        }
        
        case '!cancel': {
            const matchDetails = await getMatchDetails(matchId, accessToken);
            const team1Avg = calculateTeamElo(matchDetails.teams.faction1.roster);
            const team2Avg = calculateTeamElo(matchDetails.teams.faction2.roster);
            const eloDiff = Math.abs(team1Avg - team2Avg);
            
            if (eloDiff >= 70) {
                return "⚠️ Match cancellation approved - ELO difference is 70 or greater. Please wait for admin assistance.";
            } else {
                return `Cannot cancel - ELO difference (${eloDiff}) is less than 70.`;
            }
        }
        
        default:
            return null;
    }
}

// Setup Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Add middleware
app.use(express.json());
app.use(cors());

// Base endpoint
app.get('/', (req, res) => {
    res.send('Bot is running! ✓');
});

// Match webhook endpoint
app.post('/webhook/match', async (req, res) => {
    try {
        const { event } = req.body;
        
        // Check if this is a match start event
        if (event === 'match_status_ready' || event === 'match_status_configuring') {
            const matchId = req.body.payload.id;
            console.log(`Match ${matchId} is starting`);
            
            // Initialize match state
            matchStates.set(matchId, new MatchState(matchId, Date.now()));
            
            // Get a valid access token
            const accessToken = await getValidAccessToken();
            
            // Get match details
            const matchDetails = await getMatchDetails(matchId, accessToken);
            const roomId = matchDetails.chat_room_id;
            
            // Send greeting message
            const greetingMessage = "👋 Welcome to the match! Commands available for the next 5 minutes:\n" +
                                  "!rehost - Vote for match rehost (requires 6 votes)\n" +
                                  "!cancel - Check if match can be cancelled due to ELO difference";
            
            await sendMessage(roomId, greetingMessage, accessToken);
            console.log(`Sent greeting message to match ${matchId}`);
        }
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error handling match webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// Chat webhook endpoint
app.post('/webhook/chat', async (req, res) => {
    try {
        const { payload } = req.body;
        const message = payload.message.text;
        const matchId = payload.match_id;
        const playerId = payload.user_id;
        
        if (!message.startsWith('!')) {
            return res.status(200).json({ status: 'ignored' });
        }
        
        // Get a valid access token
        const accessToken = await getValidAccessToken();
        
        // Handle the command
        const response = await handleMatchCommand(matchId, message, playerId, accessToken);
        
        if (response) {
            // Get match details for room ID
            const matchDetails = await getMatchDetails(matchId, accessToken);
            await sendMessage(matchDetails.chat_room_id, response, accessToken);
        }
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error handling chat webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (_, res) => {
    res.json({
        status: 'healthy',
        hubId: FACEIT_HUB_ID ? 'configured' : 'missing',
        hasToken: process.env.FACEIT_ACCESS_TOKEN ? 'yes' : 'no'
    });
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- POST /webhook/match - Receive match webhooks');
    console.log('- POST /webhook/chat - Receive chat webhooks');
    console.log('- GET /health - Check server status');
});

// Handle errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

export { sendMessage };
