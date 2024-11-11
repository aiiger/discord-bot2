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

// Helper function to log lobby messages
const sendLobbyMessage = async (matchId, message) => {
    try {
        await faceitJS.sendRoomMessage(matchId, message);
        logger.info(`[LOBBY MESSAGE] Match ${matchId}: "${message}"`);
    } catch (error) {
        logger.error(`Failed to send lobby message to match ${matchId}:`, error);
        throw error;
    }
};

// Test message function
const testMessageSend = async (roomId) => {
    try {
        // First try to authenticate
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);
        logger.info(`[TEST] Please authenticate first at: ${url}`);
        logger.info(`[TEST] After authentication, the bot will try to send a message to room ${roomId}`);

        // Store the test info to use after authentication
        global.pendingTest = {
            roomId,
            state,
            codeVerifier
        };

        return {
            status: 'auth_required',
            authUrl: url
        };
    } catch (error) {
        logger.error(`[TEST] Failed to initialize test:`, error);
        return {
            status: 'error',
            error: error.message
        };
    }
};

// Validate required environment variables
const requiredEnvVars = [
    'SESSION_SECRET',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REDIRECT_URI',
    'HUB_ID',
    'DISCORD_TOKEN',
    'FACEIT_API_KEY'
];

const patterns = {
    SESSION_SECRET: /^[a-f0-9]{128}$/,
    CLIENT_ID: /^[\w-]{36}$/,
    CLIENT_SECRET: /^[\w]{40}$/,
    REDIRECT_URI: /^https:\/\/[\w.-]+\.herokuapp\.com\/callback$/,
    HUB_ID: /^[\w-]{36}$/,
    FACEIT_API_KEY: /^[\w-]{36}$/
};

const validators = {
    SESSION_SECRET: (secret) => patterns.SESSION_SECRET.test(secret),
    CLIENT_ID: (id) => patterns.CLIENT_ID.test(id),
    CLIENT_SECRET: (secret) => patterns.CLIENT_SECRET.test(secret),
    REDIRECT_URI: (uri) => patterns.REDIRECT_URI.test(uri),
    HUB_ID: (id) => patterns.HUB_ID.test(id),
    DISCORD_TOKEN: (token) => typeof token === 'string' && token.length > 0,
    FACEIT_API_KEY: (key) => patterns.FACEIT_API_KEY.test(key)
};

for (const varName of requiredEnvVars) {
    const value = process.env[varName];
    if (!value) {
        logger.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }

    if (!validators[varName](value)) {
        logger.error(`Invalid format for ${varName}: ${value}`);
        if (patterns[varName]) {
            logger.error(`Expected format: ${patterns[varName]}`);
        }
        process.exit(1);
    }
}

logger.info('Environment variables validated successfully');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

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

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

app.get('/', (req, res) => {
    logger.info(`Home route accessed by IP: ${req.ip}`);
    res.send('<a href="/login">Login with FACEIT</a>');
});

// Test endpoint to send a message to a specific room
app.get('/test-message/:roomId', async (req, res) => {
    const { roomId } = req.params;
    try {
        const result = await testMessageSend(roomId);
        if (result.status === 'auth_required') {
            res.redirect(result.authUrl);
        } else {
            res.status(500).send('Failed to initialize test');
        }
    } catch (error) {
        logger.error('Error in test endpoint:', error);
        res.status(500).send('Error processing request');
    }
});

// Add a callback endpoint for after authentication
app.get('/test-callback', async (req, res) => {
    const { code, state } = req.query;
    const pendingTest = global.pendingTest;

    if (!pendingTest || state !== pendingTest.state) {
        return res.status(400).send('Invalid state parameter');
    }

    try {
        // Exchange the code for tokens
        await faceitJS.exchangeCodeForToken(code, pendingTest.codeVerifier);

        // Now try to send the test message
        const testMessage = "Bot test message - Hello! I am online and working. Commands available: !rehost (6/10 votes needed) and !cancel (checks ELO difference ≥ 70)";
        await faceitJS.sendRoomMessage(pendingTest.roomId, testMessage);

        // Clear the pending test
        global.pendingTest = null;

        res.send('Test message sent successfully! You can close this window.');
    } catch (error) {
        logger.error('Error in test callback:', error);
        res.status(500).send('Failed to send test message');
    }
});

// Add login route
app.get('/login', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        logger.info(`Generated state: ${state} and code verifier for session: ${req.session.id}`);

        // Store state and code verifier in session
        req.session.oauthState = state;
        req.session.codeVerifier = codeVerifier;

        logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
        logger.info(`Redirecting to: ${url}`);
        res.redirect(url);
    } catch (error) {
        logger.error('Error in login route:', error);
        res.status(500).send('Internal server error');
    }
});

// Add callback route
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    logger.info(`Callback received - Session ID: ${req.session.id}`);
    logger.info(`State from query: ${state}`);
    logger.info(`State from session: ${req.session.oauthState}`);
    logger.info(`Code verifier from session: ${req.session.codeVerifier ? '[PRESENT]' : '[MISSING]'}`);

    try {
        // Verify state parameter
        if (!state || state !== req.session.oauthState) {
            logger.error(`State mismatch - Session State: ${req.session.oauthState}, Received State: ${state}`);
            return res.status(400).send('Invalid state parameter. Please try logging in again.');
        }

        if (!req.session.codeVerifier) {
            logger.error('Code verifier missing from session');
            return res.status(400).send('Code verifier missing. Please try logging in again.');
        }

        // Exchange the authorization code for tokens
        logger.info('Exchanging authorization code for tokens...');
        const tokens = await faceitJS.exchangeCodeForToken(code, req.session.codeVerifier);

        // Store tokens in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;

        logger.info('Successfully authenticated with FACEIT');
        res.send('Authentication successful! You can close this window.');
    } catch (error) {
        logger.error('Error during OAuth callback:', error);
        res.status(500).send('Authentication failed. Please try logging in again.');
    }
});

// Handle match state changes
faceitJS.onMatchStateChange(async (match) => {
    try {
        logger.info(`[MATCH STATE] Match ${match.id} state changed to ${match.state}`);
        matchStates.set(match.id, match.state);

        // Get match details including chat room info
        const matchDetails = await faceitJS.getMatchDetails(match.id);

        // Send greeting when match enters configuration (map veto) phase
        if (match.state === 'CONFIGURING' && !greetedMatches.has(match.id)) {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;
            await sendLobbyMessage(match.id, greeting);
            greetedMatches.add(match.id);
            logger.info(`[MATCH EVENT] Sent initial greeting for match ${match.id} during map veto phase`);
        }

        // Send other notifications based on state
        let notification = '';
        switch (match.state) {
            case 'ONGOING':
                notification = 'Match has started! Good luck and have fun!';
                break;
            case 'FINISHED':
                notification = 'Match has ended. Thanks for playing!';
                // Clear any existing votes and greeting status for this match
                rehostVotes.delete(match.id);
                greetedMatches.delete(match.id);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                // Clear any existing votes and greeting status for this match
                rehostVotes.delete(match.id);
                greetedMatches.delete(match.id);
                break;
        }

        if (notification) {
            await sendLobbyMessage(match.id, notification);
            logger.info(`[MATCH EVENT] Match ${match.id} state changed to ${match.state}`);
        }
    } catch (error) {
        logger.error('Error handling match state change:', error);
    }
});

// Check if match is in configuration or lobby phase
const isValidMatchPhase = (matchState) => {
    return matchState === 'READY' || matchState === 'CONFIGURING';
};

// Calculate average ELO for a team
const calculateTeamAvgElo = (team) => {
    const totalElo = team.roster.reduce((sum, player) => sum + player.elo, 0);
    return totalElo / team.roster.length;
};

// Handle FACEIT chat messages
faceitJS.onRoomMessage(async (message, roomId) => {
    try {
        const command = message.text.toLowerCase();
        const playerId = message.user_id;

        // Get match details
        const matchDetails = await faceitJS.getMatchDetails(roomId);
        const matchState = matchStates.get(roomId) || matchDetails.state;

        if (!isValidMatchPhase(matchState)) {
            await sendLobbyMessage(roomId, 'Commands can only be used during configuration phase or in matchroom lobby.');
            return;
        }

        if (command === '!cancel') {
            // Calculate team average ELOs
            const team1AvgElo = calculateTeamAvgElo(matchDetails.teams.faction1);
            const team2AvgElo = calculateTeamAvgElo(matchDetails.teams.faction2);
            const eloDiff = Math.abs(team1AvgElo - team2AvgElo);

            if (eloDiff >= 70) {
                // Cancel the match
                await faceitJS.cancelMatch(roomId);
                await sendLobbyMessage(roomId, `Match has been cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`);
                logger.info(`[MATCH CANCELLED] Match ${roomId} cancelled due to ELO difference of ${eloDiff.toFixed(0)}`);
            } else {
                await sendLobbyMessage(roomId, `Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
                logger.info(`[CANCEL DENIED] Match ${roomId} - ELO difference ${eloDiff.toFixed(0)} < 70`);
            }
        } else if (command === '!rehost') {
            // Initialize vote set if it doesn't exist
            if (!rehostVotes.has(roomId)) {
                rehostVotes.set(roomId, new Set());
            }

            const votes = rehostVotes.get(roomId);

            // Check if player already voted
            if (votes.has(playerId)) {
                await sendLobbyMessage(roomId, 'You have already voted for a rehost.');
                return;
            }

            // Add vote
            votes.add(playerId);
            const currentVotes = votes.size;
            const requiredVotes = 6;

            if (currentVotes >= requiredVotes) {
                // Rehost the match
                await faceitJS.rehostMatch(roomId);
                await sendLobbyMessage(roomId, `Match has been rehosted (${currentVotes}/10 votes).`);
                // Clear votes after successful rehost
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

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

// Start server
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});

// Graceful shutdown
const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    // Close Express server
    server.close(() => {
        logger.info('Express server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        logger.info('Discord bot logged in successfully');
        // Start match state polling after successful Discord login
        faceitJS.startPolling();
        logger.info('Started FACEIT match state polling');
    })
    .catch(error => {
        logger.error('Failed to login to Discord:', error);
    });

export default app;
