// bot.js

// Import Dependencies
import express from 'express';
import session from 'express-session';
import Redis from 'redis';
import connectRedis from 'connect-redis';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from './logger.js';
import { Client, GatewayIntentBits } from 'discord.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Bottleneck from 'bottleneck';

// Load Environment Variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'SESSION_SECRET',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REDIRECT_URI',
    'HUB_ID',
    'DISCORD_TOKEN',
    'FACEIT_API_KEY',
    'REDIS_URL',
    'ALLOWED_CHANNEL_ID'
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
    FACEIT_API_KEY: (key) => patterns.FACEIT_API_KEY.test(key),
    REDIS_URL: (url) => typeof url === 'string' && url.startsWith('redis://'),
    ALLOWED_CHANNEL_ID: (id) => /^[\w]{18}$/.test(id) // Discord channel IDs are typically 18 digits
};

for (const varName of requiredEnvVars) {
    const value = process.env[varName];
    if (!value) {
        logger.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }

    if (validators[varName] && !validators[varName](value)) {
        logger.error(`Invalid format for ${varName}: ${value}`);
        logger.error(`Expected format: ${patterns[varName] || 'Custom format'}`);
        process.exit(1);
    }
}

logger.info('Environment variables validated successfully');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis for Session Store and Persistent Data
const RedisStore = connectRedis(session);
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL,
    legacyMode: true
});

redisClient.connect().catch(console.error);

// Session middleware configuration with Redis store
const isProduction = process.env.NODE_ENV === 'production';

const sessionMiddleware = session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    name: 'faceit_session',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: 'lax'
    }
});

// Apply Security Middleware
app.use(helmet());

// Apply Rate Limiting to Express Routes
const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(apiRateLimiter);

// Apply Logging Middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Apply Session Middleware
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Files (e.g., favicon)
app.use(express.static('public'));

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Initialize Bottleneck for FACEIT API Rate Limiting
const faceitLimiter = new Bottleneck({
    reservoir: 120, // Initial number of requests
    reservoirRefreshAmount: 120, // Number of requests to add at each interval
    reservoirRefreshInterval: 60 * 1000, // Refresh every minute
    maxConcurrent: 5, // Maximum concurrent requests
    minTime: 50 // Minimum time between requests in ms
});

// Handle 429 responses by retrying after specified time
faceitLimiter.on('failed', async (error, jobInfo) => {
    const { retryCount } = jobInfo;
    if (error.response && error.response.status === 429 && retryCount < 5) {
        const retryAfter = error.response.headers['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, retryCount);
        logger.warn(`Rate limited. Retrying job in ${delay} ms`);
        return delay;
    }
});

// Wrap FaceitJS API methods with the limiter
const limitedGetHubMatches = faceitLimiter.wrap(faceitJS.getHubMatches.bind(faceitJS));
const limitedGetMatchDetails = faceitLimiter.wrap(faceitJS.getMatchDetails.bind(faceitJS));
const limitedSendRoomMessage = faceitLimiter.wrap(faceitJS.sendRoomMessage.bind(faceitJS));
const limitedRehostMatch = faceitLimiter.wrap(faceitJS.rehostMatch.bind(faceitJS));
const limitedCancelMatch = faceitLimiter.wrap(faceitJS.cancelMatch.bind(faceitJS));
// Wrap other methods as needed

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Initialize Bottleneck for Discord Command Rate Limiting (optional)
const commandLimiter = new Bottleneck({
    reservoir: 60, // 60 commands per minute
    reservoirRefreshAmount: 60,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 1,
    minTime: 100 // 100 ms between commands
});

// Wrap Discord command handler (if needed)
const limitedCommandHandler = commandLimiter.wrap(async (handler) => {
    await handler();
});

// Add home route
app.get('/', (req, res) => {
    res.send('<a href="/login">Login with FACEIT</a>');
});

// Add health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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

    try {
        // Retrieve state and codeVerifier from session
        const storedState = req.session.oauthState;
        const codeVerifier = req.session.codeVerifier;

        if (!storedState || !codeVerifier) {
            logger.error('Missing state or code verifier in session');
            return res.status(400).send('Invalid session. Please try logging in again.');
        }

        // Verify state parameter
        if (state !== storedState) {
            logger.error(`State mismatch - Session State: ${storedState}, Received State: ${state}`);
            return res.status(400).send('Invalid state parameter. Please try logging in again.');
        }

        // Exchange the authorization code for tokens
        const tokens = await faceitJS.exchangeCodeForToken(code, codeVerifier);

        // Store tokens in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;

        logger.info('Successfully authenticated with FACEIT');
        res.send('Authentication successful! You can close this window.');
    } catch (error) {
        logger.error('Error during OAuth callback:', error.message);
        logger.error('Full error:', error);
        res.status(500).send('Authentication failed. Please try logging in again.');
    }
});

// Handle match state changes
faceitJS.onMatchStateChange(async (match) => {
    try {
        logger.info(`Match ${match.id} state changed to ${match.state}`);
        await redisClient.set(`matchState:${match.id}`, match.state);

        // Get match details including chat room info
        const matchDetails = await limitedGetMatchDetails(match.id);

        // Send greeting when match starts
        if (match.state === 'READY') {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;
            await limitedSendRoomMessage(match.id, greeting);
            logger.info(`Sent greeting message for match ${match.id}`);
        }

        // Send other notifications based on state
        let notification = '';
        switch (match.state) {
            case 'ONGOING':
                notification = 'Match has started! Good luck and have fun!';
                break;
            case 'FINISHED':
                notification = 'Match has ended. Thanks for playing!';
                // Clear any existing votes for this match
                await redisClient.del(`rehostVotes:${match.id}`);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                // Clear any existing votes for this match
                await redisClient.del(`rehostVotes:${match.id}`);
                break;
        }

        if (notification) {
            await limitedSendRoomMessage(match.id, notification);
            logger.info(`Sent state change notification for match ${match.id}: ${notification}`);
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

// Function to add a rehost vote
const addRehostVote = async (matchId, playerId) => {
    const voteKey = `rehostVotes:${matchId}`;
    await redisClient.sadd(voteKey, playerId);
    const voteCount = await redisClient.scard(voteKey);
    return voteCount;
};

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();

    // Optional: Restrict commands to a specific channel
    const allowedChannelId = process.env.ALLOWED_CHANNEL_ID;
    if (allowedChannelId && message.channel.id !== allowedChannelId) {
        return;
    }

    // Optional: Restrict commands to users with a specific role
    const requiredRoleName = 'Match Manager'; // Change as needed
    if (requiredRoleName && !message.member.roles.cache.some(role => role.name === requiredRoleName)) {
        return;
    }

    try {
        // Get the active match
        const matches = await limitedGetHubMatches(process.env.HUB_ID, 'ongoing');
        const activeMatch = matches[0];

        if (!activeMatch) {
            message.reply('No active matches found in the hub.');
            return;
        }

        const matchDetails = await limitedGetMatchDetails(activeMatch.match_id);
        const matchState = await redisClient.get(`matchState:${activeMatch.match_id}`) || matchDetails.status;

        if (!isValidMatchPhase(matchState)) {
            message.reply('Commands can only be used during configuration phase or in matchroom lobby.');
            return;
        }

        if (command === '!cancel') {
            // Calculate team average ELOs
            const team1AvgElo = calculateTeamAvgElo(matchDetails.teams.faction1);
            const team2AvgElo = calculateTeamAvgElo(matchDetails.teams.faction2);
            const eloDiff = Math.abs(team1AvgElo - team2AvgElo);

            if (eloDiff >= 70) {
                // Cancel the match
                await limitedCancelMatch(activeMatch.match_id);
                message.reply(`Match cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`);
                await limitedSendRoomMessage(activeMatch.match_id,
                    `Match has been cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`
                );
                logger.info(`Match ${activeMatch.match_id} cancelled due to ELO difference of ${eloDiff.toFixed(0)}`);
            } else {
                message.reply(`Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
                logger.info(`Cancel request denied for match ${activeMatch.match_id} - ELO difference ${eloDiff.toFixed(0)} < 70`);
            }
        } else if (command === '!rehost') {
            const playerId = message.author.id;

            // Add vote
            const currentVotes = await addRehostVote(activeMatch.match_id, playerId);
            const requiredVotes = 6;

            if (currentVotes >= requiredVotes) {
                // Rehost the match
                await limitedRehostMatch(activeMatch.match_id);
                message.reply(`Match ${activeMatch.match_id} rehosted successfully (${currentVotes}/10 votes).`);
                await limitedSendRoomMessage(activeMatch.match_id,
                    `Match has been rehosted (${currentVotes}/10 votes).`
                );
                // Clear votes after successful rehost
                await redisClient.del(`rehostVotes:${activeMatch.match_id}`);
                logger.info(`Match ${activeMatch.match_id} rehosted with ${currentVotes} votes`);
            } else {
                message.reply(`Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`);
                await limitedSendRoomMessage(activeMatch.match_id,
                    `Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`
                );
                logger.info(`Rehost vote recorded for match ${activeMatch.match_id} (${currentVotes}/${requiredVotes})`);
            }
        }
    } catch (error) {
        logger.error('Error handling command:', error);
        message.reply('An error occurred while processing the command.');
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

// Start Express server
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});

// Graceful Shutdown
const shutdown = () => {
    logger.info('Shutting down server...');
    server.close(() => {
        logger.info('HTTP server closed.');
        client.destroy();
        redisClient.quit();
        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('Forcing shutdown.');
        process.exit(1);
    }, 10 * 1000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
