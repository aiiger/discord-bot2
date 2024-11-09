import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from './logger.js';
import { Client, GatewayIntentBits } from 'discord.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'REDIS_URL',
    'SESSION_SECRET',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REDIRECT_URI',
    'HUB_ID',
    'DISCORD_TOKEN'
];

const patterns = {
    REDIS_URL: /^rediss:\/\/:[\w-]+@[\w.-]+:\d+$/,
    SESSION_SECRET: /^[a-f0-9]{128}$/,
    CLIENT_ID: /^[\w-]{36}$/,
    CLIENT_SECRET: /^[\w]{40}$/,
    REDIRECT_URI: /^https:\/\/[\w.-]+\.herokuapp\.com\/callback$/,
    HUB_ID: /^[\w-]{36}$/
};

const validators = {
    REDIS_URL: (url) => patterns.REDIS_URL.test(url),
    SESSION_SECRET: (secret) => patterns.SESSION_SECRET.test(secret),
    CLIENT_ID: (id) => patterns.CLIENT_ID.test(id),
    CLIENT_SECRET: (secret) => patterns.CLIENT_SECRET.test(secret),
    REDIRECT_URI: (uri) => patterns.REDIRECT_URI.test(uri),
    HUB_ID: (id) => patterns.HUB_ID.test(id),
    DISCORD_TOKEN: (token) => typeof token === 'string' && token.length > 0
};

for (const varName of requiredEnvVars) {
    const value = process.env[varName];
    if (!value) {
        logger.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }

    if (!validators[varName](value)) {
        logger.error(`Invalid format for ${varName}: ${value}`);
        logger.error(`Expected format: ${patterns[varName]}`);
        process.exit(1);
    }
}

logger.info('Environment variables validated successfully');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

// Redis event handlers
redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
redisClient.on('connect', () => logger.info('Redis Client Connected'));

// Connect to Redis
await redisClient.connect();

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Session middleware configuration
const sessionMiddleware = session({
    store: new RedisStore({
        client: redisClient,
        prefix: 'faceit:sess:',
        ttl: 86400 // 1 day
    }),
    secret: process.env.SESSION_SECRET,
    name: 'sessionId',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

// Apply middleware (only once)
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Add login route
app.get('/login', (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');

        // Store state in Redis with short TTL
        redisClient.set(`oauth:state:${state}`, 'pending', {
            EX: 300 // 5 minutes expiry
        });

        req.session.oauthState = state;

        // Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                logger.error('Failed to save session:', err);
                return res.status(500).send('Internal server error');
            }

            logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
            const authUrl = faceitJS.getAuthorizationUrl(state);
            res.redirect(authUrl);
        });
    } catch (error) {
        logger.error('Error in login route:', error);
        res.status(500).send('Internal server error');
    }
});

// Add callback route
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.session.oauthState;

    logger.info(`Callback received - Session ID: ${req.session.id}, State: ${state}`);

    try {
        // Verify state exists in Redis
        const redisState = await redisClient.get(`oauth:state:${state}`);
        if (!redisState) {
            logger.error('State not found in Redis');
            return res.status(400).send('Invalid or expired state parameter');
        }

        // Verify state parameter
        if (!state || !storedState || state !== storedState) {
            logger.error(`State mismatch - Session: ${storedState}, Redis: ${redisState}, Received: ${state}`);
            return res.status(400).send('Invalid state parameter');
        }

        // Delete used state from Redis
        await redisClient.del(`oauth:state:${state}`);

        // Exchange the authorization code for tokens
        const response = await faceitJS.oauthInstance.post('/auth/v1/oauth/token', null, {
            params: {
                grant_type: 'authorization_code',
                code: code,
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                redirect_uri: process.env.REDIRECT_URI
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        faceitJS.accessToken = response.data.access_token;
        faceitJS.refreshToken = response.data.refresh_token;

        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Error in callback route:', error);
        res.status(500).send('Internal server error');
    }
});

// Handle match state changes
faceitJS.onMatchStateChange(async (match) => {
    try {
        logger.info(`Match ${match.id} state changed to ${match.state}`);
        // For now, just log the match state change
        // We can implement player notifications later when we have the required API methods
    } catch (error) {
        logger.error('Error handling match state change:', error);
    }
});

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();

    // For now, just acknowledge commands
    // We can implement the full functionality once we have the required API methods
    if (command === '!cancel') {
        message.reply('Cancel command received. This feature will be implemented soon.');
    } else if (command === '!rehost') {
        message.reply('Rehost command received. This feature will be implemented soon.');
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
    // Don't exit the process, just log the error
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
    logger.error('Failed to login to Discord:', error);
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

export default app;