// FACEIT OAuth2 Bot with PKCE Support
import express from 'express';
import session from 'express-session';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

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

// Session middleware configuration with in-memory storage
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    name: 'faceit_session',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    rolling: true
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

// Add home route
app.get('/', (req, res) => {
    res.render('login', { authenticated: !!req.session.accessToken });
});

// Add login route
app.get('/login', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        console.log(`[AUTH] Generated state: ${state}`);
        console.log(`[AUTH] Session ID: ${req.session.id}`);
        console.log(`[AUTH] Code verifier length: ${codeVerifier.length}`);

        // Store state and code verifier in session
        req.session.oauthState = state;
        req.session.codeVerifier = codeVerifier;

        // Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                console.error('[AUTH] Failed to save session:', err);
                return res.status(500).send('Internal server error');
            }

            console.log('[AUTH] Session saved successfully');
            console.log(`[AUTH] Redirecting to: ${url}`);
            res.redirect(url);
        });
    } catch (error) {
        console.error('[AUTH] Error in login route:', error);
        res.status(500).send('Internal server error');
    }
});

// Add callback route
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    console.log(`Callback received - Session ID: ${req.session.id}`);
    console.log(`State from query: ${state}`);
    console.log(`State from session: ${req.session.oauthState}`);

    try {
        // Verify state parameter
        if (!state || state !== req.session.oauthState) {
            console.error(`State mismatch - Session State: ${req.session.oauthState}, Received State: ${state}`);
            return res.status(400).send('Invalid state parameter. Please try logging in again.');
        }

        // Exchange the authorization code for tokens
        const tokens = await faceitJS.exchangeCodeForToken(code, req.session.codeVerifier);

        // Store tokens in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;

        // Ensure session is saved before sending response
        req.session.save((err) => {
            if (err) {
                console.error('Failed to save session with tokens:', err);
                return res.status(500).send('Internal server error');
            }

            console.log('Successfully authenticated with FACEIT');
            res.send('Authentication successful! You can close this window.');
        });
    } catch (error) {
        console.error('Error during OAuth callback:', error.message);
        console.error('Full error:', error);
        res.status(500).send('Authentication failed. Please try logging in again.');
    }
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

export default app;