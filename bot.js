const express = require('express');
const axios = require('axios');
const app = express();

// Add middleware for parsing JSON
app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Environment variables
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const WEBHOOK_SECRET = 'faceit-webhook-secret-123';

// Store rehost votes
const rehostVotes = new Map(); // matchId -> Set of playerIds
const matchCommandTimeouts = new Map(); // matchId -> timeout timestamp

// Webhook security middleware
const verifyWebhookSecret = (req, res, next) => {
    const headerSecret = req.headers['x-webhook-secret'];
    const querySecret = req.query.secret;

    if (headerSecret === WEBHOOK_SECRET || querySecret === WEBHOOK_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Helper function to send message to match room
async function sendMessage(roomId, message) {
    try {
        console.log(`Sending message to room ${roomId}:`, message);
        
        const response = await axios({
            method: 'post',
            url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Content-Type': 'application/json'
            },
            data: {
                body: message
            }
        });
        
        console.log('Message sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending message:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Helper function to get room details
async function getRoomDetails(roomId) {
    try {
        const response = await axios({
            method: 'get',
            url: `https://api.faceit.com/chat/v1/rooms/${roomId}`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        
        // Response format:
        // {
        //   "members": [{
        //     "is_online": true,
        //     "member_id": "string",
        //     "nickname": "string",
        //     "photo": "string",
        //     "roles": ["string"],
        //     "status": "string"
        //   }],
        //   "name": "string",
        //   "roles": [{
        //     "color": "string",
        //     "displayed": true,
        //     "mentionable": true,
        //     "name": "string",
        //     "permissions": ["string"],
        //     "ranking": 0,
        //     "role_id": "string"
        //   }]
        // }
        
        return response.data;
    } catch (error) {
        console.error('Error getting room details:', error);
        throw error;
    }
}

// Helper function to get room messages
async function getRoomMessages(roomId) {
    try {
        const response = await axios({
            method: 'get',
            url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        
        // Response format:
        // {
        //   "is_last_page": true,
        //   "messages": [{
        //     "avatar": "string",
        //     "body": "string",
        //     "from": "string",
        //     "id": "string",
        //     "nickname": "string",
        //     "timestamp": "string"
        //   }]
        // }
        
        return response.data;
    } catch (error) {
        console.error('Error getting room messages:', error);
        throw error;
    }
}

// Helper function to get match details
async function getMatchDetails(matchId) {
    try {
        const response = await axios({
            method: 'get',
            url: `https://open.faceit.com/data/v4/matches/${matchId}`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting match details:', error);
        throw error;
    }
}

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.type('text/plain');
    res.send('Bot is running! ✓');
});

// Match webhook endpoint
app.post('/webhook/match', verifyWebhookSecret, async (req, res) => {
    const event = req.body.event || '';
    const payload = req.body.payload || {};
    
    console.log('Received match webhook:', {
        event: event,
        matchId: payload.id,
        timestamp: new Date().toISOString()
    });

    try {
        // Handle match events
        switch (event) {
            case 'match_status_ready':
            case 'match_status_configuring': {
                console.log('Match is starting:', payload.id);
                
                // Initialize command timeout for 5 minutes
                matchCommandTimeouts.set(payload.id, Date.now() + (5 * 60 * 1000));
                
                // Send welcome message
                const welcomeMessage = "👋 Welcome to the match! Commands available for the next 5 minutes:\n" +
                                    "!rehost - Vote for match rehost (requires 6 votes)\n" +
                                    "!cancel - Check if match can be cancelled due to ELO difference";
                
                if (payload.id && payload.chat_room_id) {
                    await sendMessage(payload.chat_room_id, welcomeMessage);
                }
                break;
            }
            case 'match_status_finished':
                console.log('Match has finished:', payload.id);
                // Clean up match data
                rehostVotes.delete(payload.id);
                matchCommandTimeouts.delete(payload.id);
                break;
        }
        
        res.json({ status: 'success', event: event });
    } catch (error) {
        console.error('Error handling match webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Chat webhook endpoint
app.post('/webhook/chat', verifyWebhookSecret, async (req, res) => {
    const payload = req.body.payload || {};
    
    console.log('Received chat webhook:', {
        matchId: payload.match_id,
        userId: payload.user_id,
        message: payload.message,
        timestamp: new Date().toISOString()
    });

    try {
        // Check if commands are still allowed
        const timeout = matchCommandTimeouts.get(payload.match_id);
        if (!timeout || Date.now() > timeout) {
            if (payload.message?.text?.startsWith('!')) {
                await sendMessage(payload.room_id, "Commands are no longer available for this match.");
            }
            return res.json({ status: 'success' });
        }

        // Handle chat commands
        if (payload.message?.text) {
            const text = payload.message.text.toLowerCase();
            
            if (text === '!rehost') {
                // Initialize rehost votes if not exists
                if (!rehostVotes.has(payload.match_id)) {
                    rehostVotes.set(payload.match_id, new Set());
                }
                
                const votes = rehostVotes.get(payload.match_id);
                
                // Check if player already voted
                if (votes.has(payload.user_id)) {
                    await sendMessage(payload.room_id, "You have already voted for a rehost.");
                    return res.json({ status: 'success' });
                }
                
                // Add vote
                votes.add(payload.user_id);
                const currentVotes = votes.size;
                
                if (currentVotes >= 6) {
                    // Reset votes
                    rehostVotes.delete(payload.match_id);
                    await sendMessage(payload.room_id, "Rehost vote passed! (6/6 votes) Please wait for an admin to rehost the match.");
                } else {
                    await sendMessage(payload.room_id, `Rehost vote registered (${currentVotes}/6 votes needed)`);
                }
            }
            else if (text === '!cancel') {
                try {
                    const matchDetails = await getMatchDetails(payload.match_id);
                    
                    // Calculate average ELO for each team
                    const team1Avg = matchDetails.teams.faction1.roster.reduce((sum, player) => sum + player.elo, 0) / 5;
                    const team2Avg = matchDetails.teams.faction2.roster.reduce((sum, player) => sum + player.elo, 0) / 5;
                    
                    const eloDiff = Math.abs(team1Avg - team2Avg);
                    
                    if (eloDiff >= 70) {
                        await sendMessage(payload.room_id, `Match can be cancelled - ELO difference (${Math.round(eloDiff)}) is greater than 70`);
                    } else {
                        await sendMessage(payload.room_id, `Cannot cancel - ELO difference (${Math.round(eloDiff)}) is less than 70`);
                    }
                } catch (error) {
                    console.error('Error checking match cancellation:', error);
                    await sendMessage(payload.room_id, "Error checking match cancellation status.");
                }
            }
        }
        
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error handling chat webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).type('text/plain').send('Something broke!');
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('Bot is starting...');
    console.log('Server is running on port', port);
    console.log('Available endpoints:');
    console.log('- POST /webhook/match - Receive match webhooks');
    console.log('- POST /webhook/chat - Receive chat webhooks');
    console.log('- GET /health - Check server status');
});
