// FACEIT OAuth2 Bot with PKCE Support
const express = require('express');
const session = require('express-session');
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;
const { FaceitJS } = require('./FaceitJS.js');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
// const cors = require('cors'); // Temporarily disable CORS for testing

dotenv.config();

// Initialize Redis client
let redisClient;
if (process.env.REDIS_URL) {
    console.log('[REDIS] Connecting to Redis using REDIS_URL');
    redisClient = new Redis(process.env.REDIS_URL, {
        tls: { rejectUnauthorized: false }
    });
} else {
    console.log('[REDIS] Connecting to local Redis');
    redisClient = new Redis();
}

redisClient.on('error', (err) => console.log('[REDIS] Error:', err));
redisClient.on('connect', () => console.log('[REDIS] Connected successfully'));

// Create Redis store
const redisStore = new RedisStore({ client: redisClient, prefix: 'faceit:' });

// Validate environment variables
const requiredEnvVars = [
    'SESSION_SECRET', 'CLIENT_ID', 'CLIENT_SECRET',
    'REDIRECT_URI', 'HUB_ID', 'DISCORD_TOKEN', 'FACEIT_API_KEY'
];

const redirectUriPattern = /^(http:\/\/localhost:\d+\/callback|https:\/\/[\w.-]+\.herokuapp\.com\/callback)$/;
const patterns = {
    SESSION_SECRET: /^[a-f0-9]{128}$/,
    CLIENT_ID: /^[\w-]{36}$/,
    CLIENT_SECRET: /^.{30,50}$/,
    REDIRECT_URI: redirectUriPattern,
    HUB_ID: /^[\w-]{36}$/,
    FACEIT_API_KEY: /^[\w-]{36}$/,
    DISCORD_TOKEN: /.+/ // Accept any non-empty string for Discord token
};

requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (!value || (patterns[varName] && !patterns[varName].test(value))) {
        console.error(`Invalid or missing environment variable: ${varName}`);
        process.exit(1);
    }
});

console.log('Environment variables validated successfully');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;
const faceitJS = new FaceitJS();
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Function to ensure valid access token
async function ensureValidAccessToken() {
    if (!faceitJS.accessToken) return;

    try {
        // Check if the token is valid
        await faceitJS.api.get('/user');
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('[AUTH] Access token expired. Refreshing...');
            const refreshedTokens = await faceitJS.refreshToken(faceitJS.refreshToken);
            faceitJS.setAccessToken(refreshedTokens.access_token);
            console.log('[AUTH] Access token refreshed successfully');
        } else {
            throw error;
        }
    }
}

// Middleware and session setup
// app.use(cors()); // Disable CORS for testing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Adjust session settings
app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true, // Set to true to ensure sessions are saved
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Ensure secure cookies in production
        httpOnly: true,
        maxAge: 86400000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Adjust sameSite based on environment
    }
}));

app.set('view engine', 'ejs');

// Initialize Discord client
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord bot logged in successfully'))
    .catch(error => console.error('Failed to login to Discord:', error));

// Handle home route
app.get('/', (req, res) => {
    console.log('[HOME] Session ID:', req.session.id);
    res.render('login', { authenticated: !!req.session.accessToken });
});

// Handle Faceit authentication
app.get('/auth/faceit', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        req.session.oauthState = state;
        req.session.codeVerifier = codeVerifier;

        console.log('[AUTH] Generated state:', state);
        console.log('[AUTH] Generated codeVerifier:', codeVerifier);

        res.redirect(url);
    } catch (error) {
        console.error('[AUTH] Error:', error);
        res.status(500).render('error', { message: 'Internal Server Error' });
    }
});

// Handle Faceit OAuth callback
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    console.log('[CALLBACK] Received code:', code);
    console.log('[CALLBACK] Received state:', state);
    console.log('[CALLBACK] Session oauthState:', req.session.oauthState);
    console.log('[CALLBACK] Session codeVerifier:', req.session.codeVerifier);

    if (!state || state !== req.session.oauthState) {
        console.error('[CALLBACK] Invalid state parameter');
        return res.status(400).render('error', { message: 'Invalid State' });
    }

    try {
        const tokens = await faceitJS.exchangeCodeForToken(code, req.session.codeVerifier);
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        faceitJS.setAccessToken(tokens.access_token);

        res.redirect('/dashboard');
    } catch (error) {
        console.error('[CALLBACK] Error:', error);
        res.status(500).render('error', { message: 'Authentication Failed' });
    }
});

// Handle dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) return res.redirect('/');
    res.render('dashboard', {
        authenticated: true,
        discordConnected: client.isReady(),
        faceitConnected: !!faceitJS.accessToken,
        matchPollingActive: !!faceitJS.pollingInterval
    });
});

// Start polling for match state if not already running
if (!faceitJS.pollingInterval) {
    faceitJS.startPolling();
    console.log('[CALLBACK] Match state polling initialized');
}

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        await ensureValidAccessToken();
        const matchDetails = await faceitJS.getMatchDetails(match.id);

        if (match.state === 'READY') {
            const roomId = match.chat_room_id || `match-${match.id}`;
            if (!roomId) {
                console.error(`[CHAT] No valid room ID for match ${match.id}`);
                return;
            }

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
