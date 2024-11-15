// FACEIT OAuth2 Bot with PKCE Support
const express = require('express');
const session = require('express-session');
const { FaceitJS } = require('./FaceitJS.js');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;
const authRouter = require('./auth');

dotenv.config();

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
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }

    if (!validators[varName](value)) {
        console.error(`Invalid format for ${varName}: ${value}`);
        console.error(`Expected format: ${patterns[varName]}`);
        process.exit(1);
    }
}

console.log('Environment variables validated successfully');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Force production mode for Heroku
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Redis client
let redisClient;
if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
} else {
    console.warn('No REDIS_URL found, falling back to local Redis');
    redisClient = new Redis();
}

// Session middleware configuration with Redis storage
const sessionMiddleware = session({
    store: new RedisStore({ client: redisClient }),
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

// Store for rehost votes and match states
const rehostVotes = new Map(); // matchId -> Set of player IDs who voted
const matchStates = new Map(); // matchId -> match state

// Apply middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine
app.set('view engine', 'ejs');

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Mount auth router
app.use('/auth', authRouter);

// Add home route
app.get('/', (req, res) => {
    res.render('login', { authenticated: !!req.session.accessToken });
});

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        console.log(`Match ${match.id} state changed to ${match.state}`);
        matchStates.set(match.id, match.state);

        // Get match details including chat room info
        const matchDetails = await faceitJS.getMatchDetails(match.id);

        // Send greeting when match starts
        if (match.state === 'READY') {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun!`;

            const result = await faceitJS.sendRoomMessage(match.id, greeting);
            if (result.success) {
                console.log(`[MATCH STATE] Greeting sent to match ${match.id}`);
            } else {
                console.error(`[MATCH STATE] Failed to send greeting: ${result.error}`);
            }
        }
    } catch (error) {
        console.error('Error handling match state change:', error);
    }
});

// Start the Express server
app.listen(port, () => console.log(`Server running on port ${port}`));

module.exports = app;
