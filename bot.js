const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Add startup logging
console.log('Bot is starting...');
console.log('Checking environment variables...');

if (!FACEIT_API_KEY || !FACEIT_HUB_ID) {
    console.error('Missing required environment variables:');
    if (!FACEIT_API_KEY) console.error('- FACEIT_API_KEY');
    if (!FACEIT_HUB_ID) console.error('- FACEIT_HUB_ID');
    process.exit(1);
}

console.log('Environment variables verified ✓');
console.log('Bot is ready to handle messages');

// Track rehost votes per match
const rehostVotes = new Map();

// Track command timeouts per match
const matchCommandTimeouts = new Map();

// Setup Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Add middleware
app.use(express.json());
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    next();
});

// Base endpoint
app.get('/', (req, res) => {
    console.log('Handling root endpoint request');
    res.send('Bot is running! ✓');
});

// Test endpoint to verify API authentication
app.get('/test-auth', async (req, res) => {
    console.log('Handling /test-auth request');
    try {
        console.log('Testing API authentication...');
        console.log('Using Hub ID:', FACEIT_HUB_ID);
        
        const url = `https://open.faceit.com/data/v4/hubs/${FACEIT_HUB_ID}`;
        console.log('Making request to:', url);
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('API authentication successful');
        console.log('Response data:', response.data);
        
        res.json({
            status: 'success',
            message: 'API authentication successful',
            hubName: response.data.name,
            hubGame: response.data.game_id,
            hubRegion: response.data.region
        });
    } catch (error) {
        console.error('API authentication failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            stack: error.stack
        });

        res.status(error.response?.status || 500).json({
            error: 'API authentication failed',
            details: error.response?.data || error.message,
            stack: error.stack
        });
    }
});

// Health check endpoint
app.get('/health', (_, res) => {
    console.log('Handling /health request');
    res.json({
        status: 'healthy',
        apiKey: FACEIT_API_KEY ? 'configured' : 'missing',
        hubId: FACEIT_HUB_ID ? 'configured' : 'missing',
        uptime: process.uptime()
    });
});

// Match webhook endpoint
app.post('/webhook/match', async (req, res) => {
    console.log('Handling /webhook/match request');
    try {
        const { event } = req.body;
        
        // Check if this is a match start event
        if (event === 'match_status_ready' || event === 'match_status_configuring') {
            const matchId = req.body.payload.id;
            console.log(`Match ${matchId} is starting`);
            
            // Get the match room ID
            const roomId = await getMatchRoomId(matchId);
            
            // Send greeting message
            const greetingMessage = "👋 Welcome to the match! Commands available for the next 5 minutes:\n" +
                                  "!rehost - Vote for match rehost (requires 6 votes)\n" +
                                  "!cancel - Check if match can be cancelled due to ELO difference";
            
            await sendMessage(roomId, greetingMessage);
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
    console.log('Handling /webhook/chat request');
    try {
        const { payload } = req.body;
        const message = payload.message.text;
        const matchId = payload.match_id;
        const playerId = payload.user_id;
        
        if (!message.startsWith('!')) {
            return res.status(200).json({ status: 'ignored' });
        }
        
        // Handle test commands
        if (matchId.startsWith('test-')) {
            let response;
            if (message === '!rehost') {
                response = "Test mode - Rehost vote registered (1/6 votes)";
            } else if (message === '!cancel') {
                response = "Test mode - Cannot cancel - ELO difference (50) is less than 70";
            }
            
            if (response) {
                console.log('Test mode response:', response);
                await sendMessage('test-room-123', response);
            }
            
            return res.status(200).json({ status: 'success' });
        }
        
        // Handle real commands
        const response = await handleMatchCommand(matchId, message, playerId);
        
        if (response) {
            const roomId = await getMatchRoomId(matchId);
            await sendMessage(roomId, response);
        }
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error handling chat webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions
async function sendMessage(roomId, message) {
    try {
        console.log(`Sending message to room ${roomId}: ${message}`);
        
        const payload = {
            message: message
        };
        
        console.log('Request payload:', JSON.stringify(payload, null, 2));
        
        if (roomId.startsWith('test-')) {
            console.log('Test mode - simulating message send');
            console.log('Message would be:', message);
            return true;
        }
        
        const response = await axios.post(`https://open.faceit.com/chat/v1/rooms/${roomId}/messages`, payload, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
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

async function getMatchRoomId(matchId) {
    try {
        if (matchId.startsWith('test-')) {
            console.log('Test mode - returning test room ID');
            return 'test-room-123';
        }
        
        const response = await axios.get(`https://open.faceit.com/data/v4/matches/${matchId}`, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.chat_room_id;
    } catch (error) {
        console.error('Error getting match room ID:', error);
        throw error;
    }
}

async function getMatchDetails(matchId) {
    try {
        const response = await axios.get(`https://open.faceit.com/data/v4/matches/${matchId}`, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Error getting match details:', error);
        throw error;
    }
}

async function handleMatchCommand(matchId, command, playerId) {
    // Check if commands are still allowed (5 minutes from match start)
    const timeout = matchCommandTimeouts.get(matchId);
    if (timeout && Date.now() > timeout) {
        return "Commands are no longer available for this match.";
    }

    // Initialize command timeout if not set
    if (!timeout) {
        matchCommandTimeouts.set(matchId, Date.now() + (5 * 60 * 1000)); // 5 minutes
    }

    switch (command.toLowerCase()) {
        case '!rehost': {
            // Initialize rehost votes for this match if not exists
            if (!rehostVotes.has(matchId)) {
                rehostVotes.set(matchId, new Set());
            }

            const votes = rehostVotes.get(matchId);
            
            // Check if player already voted
            if (votes.has(playerId)) {
                return "You have already voted for a rehost.";
            }

            // Add vote
            votes.add(playerId);
            const currentVotes = votes.size;
            
            if (currentVotes >= 6) {
                // Reset votes
                rehostVotes.delete(matchId);
                return "Rehost vote passed! (6/6 votes) Please wait for an admin to rehost the match.";
            }

            return `Rehost vote registered (${currentVotes}/6 votes needed)`;
        }

        case '!cancel': {
            try {
                const matchDetails = await getMatchDetails(matchId);
                
                // Calculate average ELO for each team
                const team1Avg = matchDetails.teams.faction1.roster.reduce((sum, player) => sum + player.elo, 0) / 5;
                const team2Avg = matchDetails.teams.faction2.roster.reduce((sum, player) => sum + player.elo, 0) / 5;
                
                const eloDiff = Math.abs(team1Avg - team2Avg);
                
                if (eloDiff >= 70) {
                    return `Match can be cancelled - ELO difference (${Math.round(eloDiff)}) is greater than 70`;
                } else {
                    return `Cannot cancel - ELO difference (${Math.round(eloDiff)}) is less than 70`;
                }
            } catch (error) {
                console.error('Error checking match cancellation:', error);
                return "Error checking match cancellation status.";
            }
        }

        default:
            return null; // Ignore unknown commands
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        stack: err.stack
    });
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET /test-auth - Test API authentication');
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
