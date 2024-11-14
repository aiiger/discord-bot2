// FACEIT OAuth2 Bot with PKCE Support
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;
const { FaceitJS } = require('./FaceitJS.js');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

dotenv.config();

// Initialize Redis client
let redisClient;
if (process.env.REDIS_URL) {
    console.log('[REDIS] Connecting to Redis using REDIS_URL');
    redisClient = new Redis(process.env.REDIS_URL, {
        tls: {
            rejectUnauthorized: false
        }
    });
} else {
    console.log('[REDIS] Connecting to local Redis');
    redisClient = new Redis();
}

redisClient.on('error', (err) => console.log('[REDIS] Error:', err));
redisClient.on('connect', () => console.log('[REDIS] Connected successfully'));

// Create Redis store
const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'faceit:',
});

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

// Allow both localhost and Heroku URLs for development/production
const redirectUriPattern = /^(http:\/\/localhost:\d+\/callback|https:\/\/[\w.-]+\.herokuapp\.com\/callback)$/;

const patterns = {
    SESSION_SECRET: /^[a-f0-9]{128}$/,
    CLIENT_ID: /^[\w-]{36}$/,
    CLIENT_SECRET: /^.{30,50}$/,  // Accept between 30-50 characters
    REDIRECT_URI: redirectUriPattern,  // Updated to allow both localhost and Heroku
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

// CORS configuration
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Cookie parser middleware
app.use(cookieParser(process.env.SESSION_SECRET));

// Session middleware configuration
const sessionConfig = {
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    name: 'faceit.session',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'none',
        path: '/',
        domain: isProduction ? '.herokuapp.com' : undefined
    }
};

// Configure session for production
if (isProduction) {
    app.set('trust proxy', 1);
}

// Apply middleware
app.use((req, res, next) => {
    // Add CORS headers for all responses
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    console.log(`${req.method} ${req.path} - IP: ${req.ip}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('Signed Cookies:', JSON.stringify(req.signedCookies, null, 2));
    next();
});

// Apply session middleware before route handlers
app.use(session(sessionConfig));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine
app.set('view engine', 'ejs');

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Store for rehost votes and match states
const rehostVotes = new Map(); // matchId -> Set of player IDs who voted
const matchStates = new Map(); // matchId -> match state

// Add home route
app.get('/', (req, res) => {
    console.log('[HOME] Session ID:', req.session.id);
    console.log('[HOME] Access Token:', !!req.session.accessToken);
    console.log('[HOME] Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('[HOME] Signed Cookies:', JSON.stringify(req.signedCookies, null, 2));
    res.render('login', { authenticated: !!req.session.accessToken });
});

// Add auth route
app.get('/auth/faceit', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        console.log(`[AUTH] Generated state: ${state}`);
        console.log(`[AUTH] Session ID: ${req.session.id}`);
        console.log(`[AUTH] Code verifier length: ${codeVerifier.length}`);
        console.log('[AUTH] Cookies:', JSON.stringify(req.cookies, null, 2));
        console.log('[AUTH] Signed Cookies:', JSON.stringify(req.signedCookies, null, 2));

        // Store state and code verifier in session
        req.session.oauthState = state;
        req.session.codeVerifier = codeVerifier;

        // Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                console.error('[AUTH] Failed to save session:', err);
                return res.status(500).render('error', {
                    message: 'Internal Server Error',
                    error: 'Failed to save session'
                });
            }

            console.log('[AUTH] Session saved successfully');
            console.log('[AUTH] Redirecting to:', url);
            res.redirect(url);
        });
    } catch (error) {
        console.error('[AUTH] Error in auth route:', error);
        res.status(500).render('error', {
            message: 'Internal Server Error',
            error: error.message
        });
    }
});

// Add callback route
app.get('/callback', async (req, res) => {
    console.log('[CALLBACK] Received callback request');
    console.log('[CALLBACK] Session ID:', req.session.id);
    console.log('[CALLBACK] Query params:', req.query);
    console.log('[CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[CALLBACK] Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('[CALLBACK] Signed Cookies:', JSON.stringify(req.signedCookies, null, 2));

    const { code, state } = req.query;

    try {
        console.log('[CALLBACK] Stored state:', req.session.oauthState);
        console.log('[CALLBACK] Received state:', state);

        // Verify state parameter
        if (!state || state !== req.session.oauthState) {
            console.error('[CALLBACK] State mismatch');
            console.error('[CALLBACK] Session state:', req.session.oauthState);
            console.error('[CALLBACK] Received state:', state);
            return res.status(400).render('error', {
                message: 'Invalid State',
                error: 'State parameter mismatch. Please try logging in again.'
            });
        }

        console.log('[CALLBACK] State verified successfully');
        console.log('[CALLBACK] Code verifier:', req.session.codeVerifier);

        // Exchange the authorization code for tokens
        const tokens = await faceitJS.exchangeCodeForToken(code, req.session.codeVerifier);

        console.log('[CALLBACK] Token exchange successful');

        // Store tokens in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;

        // Set the access token in FaceitJS instance
        faceitJS.setAccessToken(tokens.access_token);

        // Start match state polling after successful authentication
        if (!faceitJS.pollingInterval) {
            faceitJS.startPolling();
            console.log('[CALLBACK] Started FACEIT match state polling');
        }

        // Ensure session is saved before sending response
        req.session.save((err) => {
            if (err) {
                console.error('[CALLBACK] Failed to save session with tokens:', err);
                return res.status(500).render('error', {
                    message: 'Internal Server Error',
                    error: 'Failed to save session'
                });
            }

            console.log('[CALLBACK] Session saved successfully');
            console.log('[CALLBACK] Redirecting to dashboard');
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('[CALLBACK] Error during OAuth callback:', error.message);
        console.error('[CALLBACK] Full error:', error);
        res.status(500).render('error', {
            message: 'Authentication Failed',
            error: error.message
        });
    }
});

// Add dashboard route
app.get('/dashboard', (req, res) => {
    console.log('[DASHBOARD] Session ID:', req.session.id);
    console.log('[DASHBOARD] Access Token:', !!req.session.accessToken);
    console.log('[DASHBOARD] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[DASHBOARD] Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('[DASHBOARD] Signed Cookies:', JSON.stringify(req.signedCookies, null, 2));

    if (!req.session.accessToken) {
        console.log('[DASHBOARD] No access token, redirecting to login');
        return res.redirect('/');
    }

    // Set the access token in FaceitJS instance (in case of page refresh)
    faceitJS.setAccessToken(req.session.accessToken);

    // Start polling if not already started
    if (!faceitJS.pollingInterval) {
        faceitJS.startPolling();
        console.log('[DASHBOARD] Started FACEIT match state polling');
    }

    // Pass bot status to the dashboard template
    res.render('dashboard', {
        authenticated: true,
        discordConnected: client.isReady(),
        faceitConnected: true,
        matchPollingActive: !!faceitJS.pollingInterval
    });
});

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        console.log(`[MATCH STATE] Match ${match.id} state changed to ${match.state}`);
        console.log(`[MATCH STATE] Previous state: ${match.previousState}`);
        console.log(`[MATCH STATE] Access token available: ${!!faceitJS.accessToken}`);

        matchStates.set(match.id, match.state);

        // Get match details including chat room info
        console.log(`[MATCH STATE] Getting match details for ${match.id}`);
        const matchDetails = await faceitJS.getMatchDetails(match.id);
        console.log(`[MATCH STATE] Got match details for ${match.id}`);

        // Send greeting when match starts
        if (match.state === 'READY') {
            console.log(`[MATCH STATE] Match ${match.id} is READY, preparing greeting`);
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;

            console.log(`[MATCH STATE] Sending greeting to match ${match.id}`);
            const result = await faceitJS.sendRoomMessage(match.id, greeting);
            if (result.success) {
                console.log(`[MATCH STATE] Greeting sent successfully to match ${match.id}`);
            } else {
                console.error(`[MATCH STATE] Failed to send greeting to match ${match.id}:`, result.error);
            }
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
                rehostVotes.delete(match.id);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                // Clear any existing votes for this match
                rehostVotes.delete(match.id);
                break;
        }

        if (notification) {
            console.log(`[MATCH STATE] Sending notification for match ${match.id}: ${notification}`);
            const result = await faceitJS.sendRoomMessage(match.id, notification);
            if (result.success) {
                console.log(`[MATCH STATE] Notification sent successfully to match ${match.id}`);
            } else {
                console.error(`[MATCH STATE] Failed to send notification to match ${match.id}:`, result.error);
            }
        }
    } catch (error) {
        console.error('[MATCH STATE] Detailed error in match state change handler:', {
            matchId: match.id,
            state: match.state,
            previousState: match.previousState,
            error: error.message,
            stack: error.stack,
            hasAccessToken: !!faceitJS.accessToken
        });
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

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();

    try {
        // Get the active match
        const matches = await faceitJS.getHubMatches(process.env.HUB_ID, 'ongoing');
        const activeMatch = matches[0];

        if (!activeMatch) {
            message.reply('No active matches found in the hub.');
            return;
        }

        const matchDetails = await faceitJS.getMatchDetails(activeMatch.match_id);
        const matchState = matchStates.get(activeMatch.match_id) || matchDetails.status;

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
                await faceitJS.cancelMatch(activeMatch.match_id);
                message.reply(`Match cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Match has been cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`
                );
                console.log(`Match ${activeMatch.match_id} cancelled due to ELO difference of ${eloDiff.toFixed(0)}`);
            } else {
                message.reply(`Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
                console.log(`Cancel request denied for match ${activeMatch.match_id} - ELO difference ${eloDiff.toFixed(0)} < 70`);
            }
        } else if (command === '!rehost') {
            const playerId = message.author.id;

            // Initialize vote set if it doesn't exist
            if (!rehostVotes.has(activeMatch.match_id)) {
                rehostVotes.set(activeMatch.match_id, new Set());
            }

            const votes = rehostVotes.get(activeMatch.match_id);

            // Check if player already voted
            if (votes.has(playerId)) {
                message.reply('You have already voted for a rehost.');
                return;
            }

            // Add vote
            votes.add(playerId);
            const currentVotes = votes.size;
            const requiredVotes = 6;

            if (currentVotes >= requiredVotes) {
                // Rehost the match
                await faceitJS.rehostMatch(activeMatch.match_id);
                message.reply(`Match ${activeMatch.match_id} rehosted successfully (${currentVotes}/10 votes).`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Match has been rehosted (${currentVotes}/10 votes).`
                );
                // Clear votes after successful rehost
                rehostVotes.delete(activeMatch.match_id);
                console.log(`Match ${activeMatch.match_id} rehosted with ${currentVotes} votes`);
            } else {
                message.reply(`Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`
                );
                console.log(`Rehost vote recorded for match ${activeMatch.match_id} (${currentVotes}/${requiredVotes})`);
            }
        }
    } catch (error) {
        console.error('Error handling command:', error);
        message.reply('An error occurred while processing the command.');
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Cleaning up...');
    redisClient.quit();
    process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Discord bot logged in successfully');
    })
    .catch(error => {
        console.error('Failed to login to Discord:', error);
    });

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;
