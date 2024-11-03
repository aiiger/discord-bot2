// app.js

const express = ('express');
const axios = ('axios');
const path = ('path');
const auth = ('./auth');
const faceitAPI = ('./endpoints');

require('dotenv').config();
const app = express();

// Add middleware for parsing JSON
app.use(express.json());
app.use(express.static('public'));

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
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret';
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
const TEST_MODE = process.env.NODE_ENV !== 'production';

// Store rehost votes, match states, last message timestamps, and tokens
const rehostVotes = new Map(); // matchId -> Set of playerIds
const matchStates = new Map(); // matchId -> { commandsEnabled: boolean }
const lastMessageTimestamps = new Map(); // roomId -> last message timestamp
let userAccessToken = null; // Store the user access token
let userRefreshToken = null; // Store the refresh token

// Root endpoint - serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// OAuth2 routes
app.get('/auth', (req, res) => {
    const authUrl = auth.getAuthUrl();
    console.log('Redirecting to FACEIT login:', authUrl);
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            return res.status(400).send('No code provided');
        }

        const tokenData = await auth.getAccessToken(code);
        console.log('Got access token:', tokenData);
        
        userAccessToken = tokenData.access_token;
        userRefreshToken = tokenData.refresh_token;

        res.send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication successful!</h2>
                    <p>The bot is now authorized to use chat commands.</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
        `);

        // Start monitoring active matches
        const matches = await getHubMatches();
        matches.forEach(match => {
            if (match.status === 'READY' || match.status === 'ONGOING' || match.status === 'VOTING') {
                matchStates.set(match.id, { commandsEnabled: true });
                monitorChatRoom(match.chatRoomId, match.id);
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication failed</h2>
                    <p>Error: ${error.message}</p>
                    <p>Please try again.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// Helper function to refresh access token
async function refreshAccessToken() {
    if (!userRefreshToken) {
        console.log('No refresh token available. Please authenticate again.');
        userAccessToken = null;
        return;
    }
    try {
        const newTokenData = await auth.refreshAccessToken(userRefreshToken);
        console.log('Refreshed access token:', newTokenData);
        userAccessToken = newTokenData.access_token;
        userRefreshToken = newTokenData.refresh_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        userAccessToken = null;
        userRefreshToken = null;
    }
}

// Helper function to get hub matches
async function getHubMatches() {
    try {
        const response = await faceitAPI.getHubMatches(FACEIT_HUB_ID, 'ongoing');
        if (response instanceof Error) {
            throw response;
        }
        
        const matches = response.items.map(match => ({
            id: match.match_id,
            status: match.status,
            chatRoomId: match.chat_room_id,
            teams: match.teams ? Object.keys(match.teams).length : 0
        }));
        
        console.log('Current hub matches:', {
            total: matches.length,
            matches: matches
        });
        
        return matches;
    } catch (error) {
        console.error('Error getting hub matches:', error);
        throw error;
    }
}

// Helper function to monitor a chat room
async function monitorChatRoom(roomId, matchId) {
    if (!userAccessToken) {
        console.log('No user access token available. Please authenticate first.');
        return;
    }

    try {
        let lastTimestamp = lastMessageTimestamps.get(roomId) || 0;

        const response = await axios({
            method: 'get',
            url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            headers: {
                'Authorization': `Bearer ${userAccessToken}`,
                'Accept': 'application/json'
            }
        });

        const messages = response.data.messages || [];
        if (messages.length > 0) {
            // Sort messages by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);

            messages.forEach(msg => {
                if (msg.timestamp > lastTimestamp) {
                    if (msg.body && msg.body.startsWith('!')) {
                        handleCommand(roomId, matchId, msg);
                    }
                    lastTimestamp = msg.timestamp;
                }
            });

            lastMessageTimestamps.set(roomId, lastTimestamp);
        }
    } catch (error) {
        console.error('Error monitoring chat room:', error);
        if (error.response?.status === 401) {
            console.log('Access token expired. Refreshing token...');
            await refreshAccessToken();
        } else if (error.response?.status === 429) {
            console.log('Rate limited by FACEIT API. Waiting before retrying...');
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 60 seconds
        } else {
            console.error('Unexpected error:', error.message);
        }
    }

    // Continue monitoring after a delay if match is still active
    const match = matchStates.get(matchId);
    if (match && match.commandsEnabled) {
        setTimeout(() => monitorChatRoom(roomId, matchId), 5000);
    }
}

// Helper function to handle chat commands
async function handleCommand(roomId, matchId, message) {
    const command = message.body.toLowerCase();
    
    if (command === '!rehost') {
        // Initialize rehost votes if not exists
        if (!rehostVotes.has(matchId)) {
            rehostVotes.set(matchId, new Set());
        }
        
        const votes = rehostVotes.get(matchId);
        
        // Check if player already voted
        if (votes.has(message.from)) {
            await sendMessage(roomId, "You have already voted for a rehost.");
            return;
        }
        
        // Add vote
        votes.add(message.from);
        const currentVotes = votes.size;
        
        if (currentVotes >= REHOST_VOTE_COUNT) {
            // Get match details to verify it's still active
            const matchDetails = await faceitAPI.getMatchDetails(matchId);
            if (matchDetails instanceof Error) {
                await sendMessage(roomId, "Error checking match status for rehost.");
                return;
            }

            if (matchDetails.status !== 'ONGOING') {
                await sendMessage(roomId, "Cannot rehost - match is not in progress.");
                return;
            }

            // Reset votes
            rehostVotes.delete(matchId);

            // Attempt to rehost the match
            try {
                await axios({
                    method: 'post',
                    url: `https://api.faceit.com/match/v1/matches/${matchId}/rehost`,
                    headers: {
                        'Authorization': `Bearer ${userAccessToken}`,
                        'Accept': 'application/json'
                    }
                });
                await sendMessage(roomId, `✅ Rehost vote passed! (${REHOST_VOTE_COUNT}/${REHOST_VOTE_COUNT} votes) Match will be rehosted.`);
            } catch (error) {
                console.error('Error rehosting match:', error);
                if (error.response?.status === 401) {
                    await refreshAccessToken();
                }
                await sendMessage(roomId, "❌ Error rehosting match. Please contact an admin for assistance.");
            }
        } else {
            await sendMessage(roomId, `📊 Rehost vote registered (${currentVotes}/${REHOST_VOTE_COUNT} votes needed)`);
        }
    }
    else if (command === '!cancel') {
        try {
            // Get match details including player stats
            const matchDetails = await faceitAPI.getMatchDetails(matchId);
            if (matchDetails instanceof Error) {
                await sendMessage(roomId, "Error checking match status for cancellation.");
                return;
            }

            if (matchDetails.status !== 'ONGOING') {
                await sendMessage(roomId, "Cannot cancel - match is not in progress.");
                return;
            }

            // Get player details for ELO calculation
            const team1Players = matchDetails.teams.faction1.roster;
            const team2Players = matchDetails.teams.faction2.roster;

            const team1Elos = await Promise.all(team1Players.map(async player => {
                const details = await faceitAPI.getPlayerDetails(player.player_id);
                return details instanceof Error ? 0 : (details.games?.csgo?.faceit_elo || 0);
            }));

            const team2Elos = await Promise.all(team2Players.map(async player => {
                const details = await faceitAPI.getPlayerDetails(player.player_id);
                return details instanceof Error ? 0 : (details.games?.csgo?.faceit_elo || 0);
            }));

            const team1Avg = team1Elos.reduce((a, b) => a + b, 0) / team1Elos.length;
            const team2Avg = team2Elos.reduce((a, b) => a + b, 0) / team2Elos.length;
            const eloDiff = Math.abs(team1Avg - team2Avg);
            
            if (eloDiff >= ELO_THRESHOLD) {
                try {
                    await axios({
                        method: 'post',
                        url: `https://api.faceit.com/match/v1/matches/${matchId}/cancel`,
                        headers: {
                            'Authorization': `Bearer ${userAccessToken}`,
                            'Accept': 'application/json'
                        }
                    });
                    await sendMessage(roomId, `✅ Match cancelled - ELO difference (${Math.round(eloDiff)}) is greater than ${ELO_THRESHOLD}`);
                } catch (error) {
                    console.error('Error cancelling match:', error);
                    if (error.response?.status === 401) {
                        await refreshAccessToken();
                    }
                    await sendMessage(roomId, "❌ Error cancelling match. Please contact an admin for assistance.");
                }
            } else {
                await sendMessage(roomId, `❌ Cannot cancel - ELO difference (${Math.round(eloDiff)}) is less than ${ELO_THRESHOLD}`);
            }
        } catch (error) {
            console.error('Error checking match cancellation:', error);
            await sendMessage(roomId, "Error checking match cancellation status.");
        }
    } else if (command === '!help') {
        const helpMessage = `👋 Available commands:\n` +
                            `!rehost - Vote for match rehost (requires ${REHOST_VOTE_COUNT} votes)\n` +
                            `!cancel - Check if match can be cancelled due to ELO difference (threshold: ${ELO_THRESHOLD})`;
        await sendMessage(roomId, helpMessage);
    } else {
        await sendMessage(roomId, `Unknown command. Type !help for a list of available commands.`);
    }
}

// Helper function to send message to match room
async function sendMessage(roomId, message) {
    if (!userAccessToken) {
        console.log('No user access token available. Please authenticate first.');
        return;
    }

    console.log(`Sending message to room ${roomId}:`, message);
    
    if (TEST_MODE) {
        console.log('TEST MODE: Message would be sent to FACEIT API:', {
            roomId,
            message
        });
        return { status: 'success', test: true };
    }
    
    try {
        const response = await axios({
            method: 'post',
            url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            headers: {
                'Authorization': `Bearer ${userAccessToken}`,
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
        if (error.response?.status === 401) {
            console.log('Access token expired. Refreshing token...');
            await refreshAccessToken();
        }
        throw error;
    }
}

// Match webhook endpoint
app.post('/webhook/match', async (req, res) => {
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
            case 'match_status_configuring':
            case 'match_status_voting': {
                console.log('Match is starting:', payload.id);
                
                // Enable commands for this match
                matchStates.set(payload.id, { commandsEnabled: true });
                
                // Use the correct chat room ID
                let roomId = payload.chat_room_id;
                if (!roomId) {
                    // Fetch match details to get chat room ID
                    const matchDetails = await faceitAPI.getMatchDetails(payload.id);
                    if (matchDetails instanceof Error) {
                        console.error('Error fetching match details for chat room ID.');
                        return res.status(500).json({ error: 'Error fetching match details.' });
                    }
                    roomId = matchDetails.chat_room_id;
                }
                
                // Send welcome message and start monitoring chat
                const welcomeMessage = `👋 Welcome to the match! Commands available:\n` +
                                    `!rehost - Vote for match rehost (requires ${REHOST_VOTE_COUNT} votes)\n` +
                                    `!cancel - Check if match can be cancelled due to ELO difference (threshold: ${ELO_THRESHOLD})\n` +
                                    `!help - Show this message`;
                
                await sendMessage(roomId, welcomeMessage);
                monitorChatRoom(roomId, payload.id);
                break;
            }
            case 'match_status_finished':
            case 'match_status_cancelled': {
                console.log('Match has ended:', payload.id);
                // Clean up match data
                rehostVotes.delete(payload.id);
                matchStates.delete(payload.id);
                lastMessageTimestamps.delete(payload.id);
                break;
            }
        }
        
        res.json({ status: 'success', event: event });
    } catch (error) {
        console.error('Error handling match webhook:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        config: {
            eloThreshold: ELO_THRESHOLD,
            rehostVoteCount: REHOST_VOTE_COUNT,
            testMode: TEST_MODE,
            hubId: FACEIT_HUB_ID,
            hasUserToken: !!userAccessToken
        },
        activeMatches: Array.from(matchStates.entries()).map(([matchId, state]) => ({
            matchId,
            commandsEnabled: state.commandsEnabled
        }))
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        response: err.response?.data
    });
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message,
        details: err.response?.data
    });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('Bot is starting...');
    console.log('Server is running on port', port);
    console.log('Configuration:');
    console.log(`- Hub ID: ${FACEIT_HUB_ID}`);
    console.log(`- ELO threshold: ${ELO_THRESHOLD}`);
    console.log(`- Rehost vote count: ${REHOST_VOTE_COUNT}`);
    console.log(`- Test mode: ${TEST_MODE}`);
    
    // Get initial hub matches
    getHubMatches().catch(console.error);
    
    console.log('Available endpoints:');
    console.log('- GET / - Login page');
    console.log('- GET /auth - Start OAuth2 authentication');
    console.log('- GET /auth/callback - OAuth2 callback');
    console.log('- POST /webhook/match - Receive match status updates');
    console.log('- GET /health - Check server status');
});
