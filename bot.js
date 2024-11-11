// FACEIT OAuth2 Bot with PKCE Support
import express from 'express';
import session from 'express-session';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

// Initialize logger
const logger = {
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO: ${message}`, ...args);
    },
    error: (message, error) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`);
        if (error?.response?.data) {
            console.error('Response data:', error.response.data);
        }
        if (error?.response?.status) {
            console.error('Status code:', error.response.status);
        }
        if (error?.config?.url) {
            console.error('Request URL:', error.config.url);
        }
        if (error?.config?.headers) {
            const sanitizedHeaders = { ...error.config.headers };
            if (sanitizedHeaders.Authorization) {
                sanitizedHeaders.Authorization = 'Bearer [REDACTED]';
            }
            console.error('Request headers:', sanitizedHeaders);
        }
        if (error?.config?.data) {
            console.error('Request data:', error.config.data);
        }
        console.error('Full error:', error);
    }
};

// Store for rehost votes and match states
const rehostVotes = new Map(); // matchId -> Set of player IDs who voted
const matchStates = new Map(); // matchId -> match state
const greetedMatches = new Set(); // Set of match IDs that have been greeted
const pendingMessages = new Map(); // Store pending messages while authenticating

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Helper function to send messages to match room
const sendLobbyMessage = async (roomId, message) => {
    try {
        await faceitJS.chatApiInstance.post(`/rooms/${roomId}/messages`, {
            body: message
        });
        logger.info(`[LOBBY MESSAGE] Match ${roomId}: "${message}"`);
    } catch (error) {
        logger.error(`Failed to send lobby message to match ${roomId}:`, error);
        throw error;
    }
};

// Helper function to get match details
const getMatchDetails = async (matchId) => {
    try {
        const response = await faceitJS.dataApiInstance.get(`/matches/${matchId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to get match details for ${matchId}:`, error);
        throw error;
    }
};

// Helper function to cancel match
const cancelMatch = async (matchId) => {
    try {
        await faceitJS.dataApiInstance.put(`/matches/${matchId}/cancel`);
        logger.info(`Successfully cancelled match ${matchId}`);
    } catch (error) {
        logger.error(`Failed to cancel match ${matchId}:`, error);
        throw error;
    }
};

// Helper function to rehost match
const rehostMatch = async (matchId) => {
    try {
        await faceitJS.dataApiInstance.put(`/matches/${matchId}/rehost`);
        logger.info(`Successfully rehosted match ${matchId}`);
    } catch (error) {
        logger.error(`Failed to rehost match ${matchId}:`, error);
        throw error;
    }
};

// Force production mode for Heroku
const isProduction = process.env.NODE_ENV === 'production';

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Session middleware configuration
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    name: 'faceit_session',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
});

// Apply middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.faceit.com", "https://open.faceit.com"]
        }
    }
}));
app.use(limiter);
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
    res.setHeader('X-Powered-By', 'FACEIT OAuth2 Bot');
    next();
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle Discord messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!sendtest')) {
        const args = message.content.split(' ');

        if (args.length < 3) {
            message.reply('Usage: !sendtest [matchId] [message]');
            return;
        }

        const matchId = args[1];
        const testMessage = args.slice(2).join(' ');

        try {
            if (!faceitJS.accessToken) {
                const state = crypto.randomBytes(32).toString('hex');
                const testRedirectUri = process.env.REDIRECT_URI.replace('/callback', '/test-callback');
                const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state, testRedirectUri);

                if (!pendingMessages.has(state)) {
                    pendingMessages.set(state, {
                        matchId,
                        message: testMessage,
                        discordMessage: message,
                        codeVerifier,
                        timestamp: Date.now()
                    });

                    logger.info(`Stored pending message for state ${state}:`, {
                        matchId,
                        message: testMessage
                    });

                    message.reply(`Please authenticate first by visiting: ${url}\nAfter authentication, the message will be sent automatically.`);
                }
                return;
            }

            await sendLobbyMessage(matchId, testMessage);
            message.reply(`Successfully sent message to match room ${matchId}`);
            logger.info(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
        } catch (error) {
            message.reply(`Failed to send message: ${error.message}`);
            logger.error('[DISCORD] Error sending test message:', error);
        }
    }
});

app.get('/', (req, res) => {
    logger.info(`Home route accessed by IP: ${req.ip}`);
    res.send('<a href="/login">Login with FACEIT</a>');
});

// Callback handler function
async function handleCallback(req, res) {
    const { code, state } = req.query;

    logger.info(`Callback received at ${req.path} - Session ID: ${req.session.id}`);
    logger.info(`State from query: ${state}`);
    logger.info(`Code from query: ${code ? '[PRESENT]' : '[MISSING]'}`);

    try {
        const pendingMessage = pendingMessages.get(state);
        if (!pendingMessage) {
            logger.error('No pending message found for state:', state);
            return res.status(400).send('Invalid state parameter or no pending message.');
        }

        logger.info(`Found pending message for state ${state}:`, {
            matchId: pendingMessage.matchId,
            message: pendingMessage.message
        });

        logger.info('Exchanging code for tokens...');
        const testRedirectUri = process.env.REDIRECT_URI.replace('/callback', '/test-callback');
        const tokens = await faceitJS.exchangeCodeForToken(code, pendingMessage.codeVerifier, testRedirectUri);
        logger.info('Successfully exchanged code for tokens');

        const roomId = pendingMessage.matchId.includes('-') ? pendingMessage.matchId.split('-')[1] : pendingMessage.matchId;

        await sendLobbyMessage(roomId, pendingMessage.message);
        await pendingMessage.discordMessage.reply(`Successfully sent message to match room ${pendingMessage.matchId}`);

        pendingMessages.delete(state);
        logger.info(`Cleared pending message for state ${state}`);

        res.send('Authentication successful and message sent! You can close this window.');
    } catch (error) {
        logger.error('Error during callback:', error);
        if (error.response?.data) {
            logger.error('API Error Response:', error.response.data);
        }
        res.status(500).send('Authentication failed. Please try again.');
    }
}

app.get('/callback', handleCallback);
app.get('/test-callback', handleCallback);

app.get('/login', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
        logger.info(`Redirecting to: ${url}`);
        res.redirect(url);
    } catch (error) {
        logger.error('Error in login route:', error);
        res.status(500).send('Internal server error');
    }
});

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        logger.info(`[MATCH STATE] Match ${match.match_id} state changed to ${match.state}`);
        matchStates.set(match.match_id, match.state);

        const matchDetails = await getMatchDetails(match.match_id);

        if (match.state === 'CONFIGURING' && !greetedMatches.has(match.match_id)) {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;
            await sendLobbyMessage(match.match_id, greeting);
            greetedMatches.add(match.match_id);
            logger.info(`[MATCH EVENT] Sent initial greeting for match ${match.match_id} during map veto phase`);
        }

        let notification = '';
        switch (match.state) {
            case 'ONGOING':
                notification = 'Match has started! Good luck and have fun!';
                break;
            case 'FINISHED':
                notification = 'Match has ended. Thanks for playing!';
                rehostVotes.delete(match.match_id);
                greetedMatches.delete(match.match_id);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                rehostVotes.delete(match.match_id);
                greetedMatches.delete(match.match_id);
                break;
        }

        if (notification) {
            await sendLobbyMessage(match.match_id, notification);
            logger.info(`[MATCH EVENT] Match ${match.match_id} state changed to ${match.state}`);
        }
    } catch (error) {
        logger.error('Error handling match state change:', error);
    }
});

const isValidMatchPhase = (matchState) => {
    return matchState === 'READY' || matchState === 'CONFIGURING';
};

const calculateTeamAvgElo = (team) => {
    const totalElo = team.roster.reduce((sum, player) => sum + player.elo, 0);
    return totalElo / team.roster.length;
};

// Handle FACEIT chat messages
faceitJS.on('chatMessage', async (message) => {
    try {
        const command = message.text.toLowerCase();
        const playerId = message.user_id;
        const roomId = message.room_id;

        const matchDetails = await getMatchDetails(roomId);
        const matchState = matchStates.get(roomId) || matchDetails.state;

        if (!isValidMatchPhase(matchState)) {
            await sendLobbyMessage(roomId, 'Commands can only be used during configuration phase or in matchroom lobby.');
            return;
        }

        if (command === '!cancel') {
            const team1AvgElo = calculateTeamAvgElo(matchDetails.teams.faction1);
            const team2AvgElo = calculateTeamAvgElo(matchDetails.teams.faction2);
            const eloDiff = Math.abs(team1AvgElo - team2AvgElo);

            if (eloDiff >= 70) {
                await cancelMatch(roomId);
                await sendLobbyMessage(roomId, `Match has been cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`);
                logger.info(`[MATCH CANCELLED] Match ${roomId} cancelled due to ELO difference of ${eloDiff.toFixed(0)}`);
            } else {
                await sendLobbyMessage(roomId, `Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
                logger.info(`[CANCEL DENIED] Match ${roomId} - ELO difference ${eloDiff.toFixed(0)} < 70`);
            }
        } else if (command === '!rehost') {
            if (!rehostVotes.has(roomId)) {
                rehostVotes.set(roomId, new Set());
            }

            const votes = rehostVotes.get(roomId);

            if (votes.has(playerId)) {
                await sendLobbyMessage(roomId, 'You have already voted for a rehost.');
                return;
            }

            votes.add(playerId);
            const currentVotes = votes.size;
            const requiredVotes = 6;

            if (currentVotes >= requiredVotes) {
                await rehostMatch(roomId);
                await sendLobbyMessage(roomId, `Match has been rehosted (${currentVotes}/10 votes).`);
                rehostVotes.delete(roomId);
                logger.info(`[MATCH REHOSTED] Match ${roomId} rehosted with ${currentVotes} votes`);
            } else {
                await sendLobbyMessage(roomId, `Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`);
                logger.info(`[REHOST VOTE] Match ${roomId} - New vote recorded (${currentVotes}/${requiredVotes})`);
            }
        }
    } catch (error) {
        logger.error('Error handling FACEIT chat message:', error);
    }
});

// Clean up old pending messages every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [state, data] of pendingMessages.entries()) {
        if (data.timestamp < oneHourAgo) {
            pendingMessages.delete(state);
        }
    }
}, 60 * 60 * 1000);

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

// Start server and login to Discord
Promise.all([
    new Promise((resolve) => {
        const server = app.listen(port, () => {
            logger.info(`Server running on port ${port}`);
            resolve(server);
        });
    }),
    client.login(process.env.DISCORD_TOKEN).then(() => {
        logger.info('Discord bot logged in successfully');
        faceitJS.startPolling();
        logger.info('Started FACEIT match state polling');
    })
]).catch(error => {
    logger.error('Failed to start services:', error);
    process.exit(1);
});

export default app;
