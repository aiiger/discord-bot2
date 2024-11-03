// bot.js

import express from 'express';
import axios from 'axios';
import auth from './auth.js';
import dotenv from 'dotenv';

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Environment Variables
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const REDIRECT_URI = process.env.FACEIT_REDIRECT_URI;

// In-memory Stores
const rehostVotes = new Map(); // matchId -> Set of playerIds
const matchStates = new Map(); // matchId -> { commandsEnabled: boolean }
const lastMessageTimestamps = new Map(); // roomId -> last message timestamp

// Routes

// Root Endpoint - Redirect to /auth
app.get('/', (req, res) => {
    res.redirect('/auth');
});

// Auth Endpoint - Redirect to Faceit Authorization URL
app.get('/auth', (req, res) => {
    const authorizationUri = auth.getAuthorizationUrl();
    console.log('Redirecting to:', authorizationUri);
    res.redirect(authorizationUri);
});

// OAuth2 Callback Endpoint
app.get('/callback', async (req, res) => {
    try {
        console.log('Callback received with query:', req.query);
        const code = req.query.code;
        const state = req.query.state;

        if (!code) {
            console.log('No code provided');
            return res.status(400).send('No code provided');
        }

        // Exchange code for access token
        const token = await auth.getAccessTokenFromCode(code);

        // Use the access token to retrieve user information
        const userInfoResponse = await axios.get(
            'https://api.faceit.com/auth/v1/resources/userinfo',
            {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                },
            }
        );

        console.log('User Info:', userInfoResponse.data);

        res.send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication Successful!</h2>
                    <p>The bot is now authorized to use chat commands.</p>
                    <p>User: ${userInfoResponse.data.username}</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
        `);

        // Start monitoring active matches
        const matches = await getActiveMatches();
        matches.forEach((match) => {
            if (
                ['READY', 'ONGOING', 'VOTING'].includes(match.status)
            ) {
                matchStates.set(match.id, { commandsEnabled: true });
                monitorChatRoom(match.chat_room_id, match.id);
            }
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication Failed</h2>
                    <p>Error: ${error.message}</p>
                    <p>Please try again.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// Match Webhook Endpoint
app.post('/webhook/match', async (req, res) => {
    const event = req.body.event || '';
    const payload = req.body.payload || {};

    console.log('Received match webhook:', {
        event: event,
        matchId: payload.id,
        timestamp: new Date().toISOString(),
    });

    try {
        // Handle match events
        switch (event) {
            case 'match_status_ready':
            case 'match_status_configuring':
            case 'match_status_voting': {
                console.log('Match is starting:', payload.id);

                matchStates.set(payload.id, { commandsEnabled: true });

                let roomId = payload.chat_room_id;
                if (!roomId) {
                    const matchDetails = await getMatchDetails(payload.id);
                    if (matchDetails instanceof Error) {
                        console.error(
                            'Error fetching match details for chat room ID.'
                        );
                        return res
                            .status(500)
                            .json({ error: 'Error fetching match details.' });
                    }
                    roomId = matchDetails.chat_room_id;
                }

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
                rehostVotes.delete(payload.id);
                matchStates.delete(payload.id);
                lastMessageTimestamps.delete(payload.id);
                break;
            }
            default:
                console.log('Unhandled event type:', event);
        }

        res.json({ status: 'success', event: event });
    } catch (error) {
        console.error('Error handling match webhook:', error);
        res.status(500).json({ error: 'Error handling match webhook.' });
    }
});

// Helper Functions

async function getActiveMatches() {
    try {
        const response = await axios.get(
            `https://api.faceit.com/match/v1/hubs/${FACEIT_HUB_ID}/matches`,
            {
                headers: {
                    Authorization: `Bearer ${FACEIT_API_KEY}`,
                },
            }
        );
        return response.data.matches || [];
    } catch (error) {
        console.error('Error fetching active matches:', error);
        return [];
    }
}

async function getMatchDetails(matchId) {
    try {
        const response = await axios.get(
            `https://api.faceit.com/match/v1/matches/${matchId}`,
            {
                headers: {
                    Authorization: `Bearer ${FACEIT_API_KEY}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching match details:', error);
        return error;
    }
}

async function handleCommand(roomId, matchId, message) {
    const command = message.body.toLowerCase();

    if (command === '!rehost') {
        if (!rehostVotes.has(matchId)) {
            rehostVotes.set(matchId, new Set());
        }

        const votes = rehostVotes.get(matchId);

        if (votes.has(message.from)) {
            await sendMessage(roomId, 'You have already voted for a rehost.');
            return;
        }

        votes.add(message.from);
        const currentVotes = votes.size;

        if (currentVotes >= REHOST_VOTE_COUNT) {
            const matchDetails = await getMatchDetails(matchId);
            if (matchDetails instanceof Error) {
                await sendMessage(
                    roomId,
                    'Error checking match status for rehost.'
                );
                return;
            }

            if (matchDetails.status !== 'ONGOING') {
                await sendMessage(
                    roomId,
                    'Cannot rehost - match is not in progress.'
                );
                return;
            }

            rehostVotes.delete(matchId);

            try {
                const token = await auth.refreshAccessToken();
                await axios.post(
                    `https://api.faceit.com/match/v1/matches/${matchId}/rehost`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${token.token.access_token}`,
                            Accept: 'application/json',
                        },
                    }
                );
                await sendMessage(
                    roomId,
                    `✅ Rehost vote passed! (${REHOST_VOTE_COUNT}/${REHOST_VOTE_COUNT} votes) Match will be rehosted.`
                );
            } catch (error) {
                console.error('Error rehosting match:', error);
                await sendMessage(
                    roomId,
                    '❌ Error rehosting match. Please contact an admin for assistance.'
                );
            }
        } else {
            await sendMessage(
                roomId,
                `📊 Rehost vote registered (${currentVotes}/${REHOST_VOTE_COUNT} votes needed)`
            );
        }
    } else if (command === '!cancel') {
        try {
            const matchDetails = await getMatchDetails(matchId);
            if (matchDetails instanceof Error) {
                await sendMessage(
                    roomId,
                    'Error checking match status for cancellation.'
                );
                return;
            }

            if (matchDetails.status !== 'ONGOING') {
                await sendMessage(
                    roomId,
                    'Cannot cancel - match is not in progress.'
                );
                return;
            }

            const team1Players = matchDetails.teams.faction1.roster;
            const team2Players = matchDetails.teams.faction2.roster;

            const team1Elos = await Promise.all(
                team1Players.map(async (player) => {
                    const details = await getPlayerDetails(player.player_id);
                    return details instanceof Error
                        ? 0
                        : details.games?.csgo?.faceit_elo || 0;
                })
            );

            const team2Elos = await Promise.all(
                team2Players.map(async (player) => {
                    const details = await getPlayerDetails(player.player_id);
                    return details instanceof Error
                        ? 0
                        : details.games?.csgo?.faceit_elo || 0;
                })
            );

            const team1Avg =
                team1Elos.reduce((a, b) => a + b, 0) / team1Elos.length;
            const team2Avg =
                team2Elos.reduce((a, b) => a + b, 0) / team2Elos.length;
            const eloDiff = Math.abs(team1Avg - team2Avg);

            if (eloDiff >= ELO_THRESHOLD) {
                try {
                    const token = await auth.refreshAccessToken();
                    await axios.post(
                        `https://api.faceit.com/match/v1/matches/${matchId}/cancel`,
                        {},
                        {
                            headers: {
                                Authorization: `Bearer ${token.token.access_token}`,
                                Accept: 'application/json',
                            },
                        }
                    );
                    await sendMessage(
                        roomId,
                        `✅ Match cancelled - ELO difference (${Math.round(
                            eloDiff
                        )}) is greater than ${ELO_THRESHOLD}`
                    );
                } catch (error) {
                    console.error('Error cancelling match:', error);
                    await sendMessage(
                        roomId,
                        '❌ Error cancelling match. Please contact an admin for assistance.'
                    );
                }
            } else {
                await sendMessage(
                    roomId,
                    `❌ Cannot cancel - ELO difference (${Math.round(
                        eloDiff
                    )}) is less than ${ELO_THRESHOLD}`
                );
            }
        } catch (error) {
            console.error('Error checking match cancellation:', error);
            await sendMessage(
                roomId,
                'Error checking match cancellation status.'
            );
        }
    } else if (command === '!help') {
        const helpMessage = `👋 Available commands:\n` +
            `!rehost - Vote for match rehost (requires ${REHOST_VOTE_COUNT} votes)\n` +
            `!cancel - Check if match can be cancelled due to ELO difference (threshold: ${ELO_THRESHOLD})\n` +
            `!help - Show this message`;
        await sendMessage(roomId, helpMessage);
    } else {
        await sendMessage(
            roomId,
            'Unknown command. Type !help for a list of available commands.'
        );
    }
}

async function getPlayerDetails(playerId) {
    try {
        const response = await axios.get(
            `https://api.faceit.com/players/v1/players/${playerId}`,
            {
                headers: {
                    Authorization: `Bearer ${FACEIT_API_KEY}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching player details:', error);
        return error;
    }
}

async function sendMessage(roomId, message) {
    try {
        const token = await auth.refreshAccessToken();

        console.log(`Sending message to room ${roomId}:`, message);

        await axios.post(
            `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            {
                body: message,
            },
            {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Message sent successfully.');
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function monitorChatRoom(roomId, matchId) {
    try {
        const token = await auth.refreshAccessToken();
        if (!token) {
            console.log('No access token available. Please authenticate first.');
            return;
        }

        let lastTimestamp = lastMessageTimestamps.get(roomId) || 0;

        const response = await axios.get(
            `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
            {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                    Accept: 'application/json',
                },
            }
        );

        const messages = response.data.messages || [];
        if (messages.length > 0) {
            messages.sort((a, b) => a.timestamp - b.timestamp);

            for (const msg of messages) {
                if (msg.timestamp > lastTimestamp) {
                    if (msg.body && msg.body.startsWith('!')) {
                        await handleCommand(roomId, matchId, msg);
                    }
                    lastTimestamp = msg.timestamp;
                }
            }

            lastMessageTimestamps.set(roomId, lastTimestamp);
        }
    } catch (error) {
        console.error('Error monitoring chat room:', error);
    }

    // Continue monitoring if match is active
    const match = matchStates.get(matchId);
    if (match && match.commandsEnabled) {
        setTimeout(() => monitorChatRoom(roomId, matchId), 5000);
    }
}

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});