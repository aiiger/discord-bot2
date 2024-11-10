// FACEIT OAuth2 Bot with PKCE Support
import express from 'express';
import session from 'express-session';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from './logger.js';
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
const greetedMatches = new Set(); // Set of match IDs that have been greeted

// Apply middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Add home route
app.get('/', (req, res) => {
    res.send('<a href="/login">Login with FACEIT</a>');
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

        // Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                logger.error('Failed to save session:', err);
                return res.status(500).send('Internal server error');
            }

            logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
            res.redirect(url);
        });
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
        // Verify state parameter
        if (!state || state !== req.session.oauthState) {
            logger.error(`State mismatch - Session State: ${req.session.oauthState}, Received State: ${state}`);
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
                logger.error('Failed to save session with tokens:', err);
                return res.status(500).send('Internal server error');
            }

            logger.info('Successfully authenticated with FACEIT');
            res.send('Authentication successful! You can close this window.');
        });
    } catch (error) {
        logger.error('Error during OAuth callback:', error.message);
        logger.error('Full error:', error);
        res.status(500).send('Authentication failed. Please try logging in again.');
    }
});

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        logger.info(`Match ${match.id} state changed from ${match.previousState} to ${match.state}`);
        matchStates.set(match.id, match.state);

        // Get match details including chat room info
        const matchDetails = await faceitJS.getMatchDetails(match.id);
        logger.info(`Retrieved details for match ${match.id}`);

        // Send greeting when match enters CONFIGURING or READY state
        if ((match.state === 'CONFIGURING' || match.state === 'READY') && !greetedMatches.has(match.id)) {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;

            logger.info(`Sending greeting message for match ${match.id}`);
            await faceitJS.sendRoomMessage(match.id, greeting);
            logger.info(`Sent greeting message for match ${match.id}`);
            greetedMatches.add(match.id);
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
            logger.info(`Sending state change notification for match ${match.id}: ${notification}`);
            await faceitJS.sendRoomMessage(match.id, notification);
            logger.info(`Sent state change notification for match ${match.id}`);
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
                logger.info(`Match ${activeMatch.match_id} cancelled due to ELO difference of ${eloDiff.toFixed(0)}`);
            } else {
                message.reply(`Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
                logger.info(`Cancel request denied for match ${activeMatch.match_id} - ELO difference ${eloDiff.toFixed(0)} < 70`);
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
                logger.info(`Match ${activeMatch.match_id} rehosted with ${currentVotes} votes`);
            } else {
                message.reply(`Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
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

// Start server
app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});

export default app;
