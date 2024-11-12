// FACEIT OAuth2 Bot with SDK Support
import express from 'express';
import session from 'express-session';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

dotenv.config();

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Initialize Express
const app = express();

// Must be first - trust proxy for Heroku
app.enable('trust proxy');

const port = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Get the base URL for the application
const getBaseUrl = () => {
    if (isProduction) {
        return 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com';
    }
    return `http://localhost:${port}`;
};

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Store match states and voting
const matchStates = new Map();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Discord client login
client.login(process.env.DISCORD_TOKEN).then(() => {
    logger.info('Discord bot logged in successfully');
}).catch(error => {
    logger.error('Failed to log in to Discord:', error);
});

// Discord client ready event
client.once('ready', () => {
    logger.info(`Discord bot logged in as ${client.user.tag}`);
});

// Handle Discord messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    try {
        switch (command) {
            case '!sendtest':
                if (args.length < 3) {
                    message.reply('Usage: !sendtest [matchId] [message]');
                    return;
                }

                const matchId = args[1];
                const testMessage = args.slice(2).join(' ');

                if (!faceitJS.accessToken) {
                    message.reply('Please authenticate first by visiting the FACEIT bot website');
                    return;
                }

                try {
                    await faceitJS.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                        body: testMessage
                    });
                    message.reply(`Successfully sent message to match room ${matchId}`);
                    logger.info(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
                } catch (error) {
                    if (error.response?.status === 401) {
                        message.reply('Authentication failed. Please try authenticating again.');
                        faceitJS.accessToken = null;
                    } else {
                        message.reply(`Failed to send message: ${error.message}`);
                    }
                    logger.error('[DISCORD] Error sending test message:', error);
                }
                break;

            case '!getmatches':
                try {
                    const matches = await faceitJS.getHubMatches(faceitJS.hubId);
                    if (matches && matches.length > 0) {
                        // Format a shorter version of match info
                        const matchList = matches.slice(0, 5).map(match =>
                            `Match ID: ${match.match_id}\n` +
                            `Status: ${match.state || 'Unknown'}\n` +
                            `Room: ${match.chat_room_id || 'No room'}\n`
                        ).join('\n');

                        message.reply(`Recent matches:\n${matchList}\n\nUse !sendtest [matchId] [message] to test sending a message.`);
                    } else {
                        message.reply('No recent matches found.');
                    }
                } catch (error) {
                    message.reply('Error getting matches: ' + error.message);
                    logger.error('Error getting matches:', error);
                }
                break;

            case '!testhelp':
                const helpMessage = `
Available test commands:
!getmatches - Get recent matches from your hub
!sendtest [matchId] [message] - Send a custom message to match chat

Example:
1. Use !getmatches to get match IDs
2. Use !sendtest with a match ID to test messaging
`;
                message.reply(helpMessage);
                break;
        }
    } catch (error) {
        if (error.response?.status === 401) {
            message.reply('Authentication failed. Please try authenticating again.');
            faceitJS.accessToken = null;
        } else {
            message.reply(`Failed to execute command: ${error.message}`);
        }
        logger.error('[DISCORD] Error executing command:', error);
    }
});

// Rate limiting configuration for Heroku
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => {
        const forwardedFor = req.headers['x-forwarded-for'];
        const clientIP = forwardedFor ? forwardedFor.split(',')[0].trim() : req.ip;
        return clientIP;
    }
});

// Session middleware configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    name: 'faceit.sid',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
    }
};

if (isProduction) {
    app.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}

// Apply middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://*.faceit.com", "https://accounts.faceit.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "https://*.faceit.com", "https://cdn.faceit.com"],
            connectSrc: ["'self'", "https://*.faceit.com", "https://api.faceit.com", "https://open.faceit.com", "https://accounts.faceit.com"],
            fontSrc: ["'self'", "https://*.faceit.com"],
            formAction: ["'self'", "https://*.faceit.com", "https://accounts.faceit.com"],
            frameSrc: ["'self'", "https://*.faceit.com", "https://accounts.faceit.com"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
}));

app.use(limiter);
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Initialize session middleware
app.use(session(sessionConfig));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import and use auth routes
import authRouter from './auth.js';
app.use('/', authRouter);

// Handle new matches and state changes
faceitJS.on('newMatch', async (match) => {
    try {
        if (match.state === 'VOTING' && match.chat_room_id) {
            // Initialize match state if not exists
            if (!matchStates.has(match.match_id)) {
                matchStates.set(match.match_id, {
                    rehostVotes: new Set(),
                    greeted: false,
                    eloChecked: false
                });
            }

            const currentMatchState = matchStates.get(match.match_id);

            // Only send greeting if we haven't greeted yet
            if (!currentMatchState.greeted) {
                const welcomeMessage = "👋 Welcome to the match! Available commands:\n" +
                    "!rehost - Vote for match rehost (6/10 players needed)\n" +
                    "Match can be cancelled if ELO difference is 70 or greater.";

                await faceitJS.chatApiInstance.post(`/rooms/${match.chat_room_id}/messages`, {
                    body: welcomeMessage
                });
                currentMatchState.greeted = true;

                // Check ELO difference
                const teams = match.teams;
                if (teams?.faction1 && teams?.faction2) {
                    const team1Elo = calculateTeamElo(teams.faction1.roster);
                    const team2Elo = calculateTeamElo(teams.faction2.roster);
                    const eloDiff = Math.abs(team1Elo - team2Elo);

                    if (eloDiff >= 70) {
                        const eloMessage = `⚠️ Warning: ELO difference is ${eloDiff}. Type !cancel to vote for cancellation.`;
                        await faceitJS.chatApiInstance.post(`/rooms/${match.chat_room_id}/messages`, {
                            body: eloMessage
                        });
                    }
                }
            }
        }
    } catch (error) {
        logger.error('Error handling new match:', error);
    }
});

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        // If match is cancelled or finished, clean up the state
        if (match.state === 'CANCELLED' || match.state === 'FINISHED') {
            if (match.chat_room_id) {
                const message = match.state === 'CANCELLED'
                    ? "❌ Match has been cancelled."
                    : "🏁 Match has ended! Thanks for playing!";

                await faceitJS.chatApiInstance.post(`/rooms/${match.chat_room_id}/messages`, {
                    body: message
                });
            }
            // Clean up match state
            matchStates.delete(match.match_id);
        }
    } catch (error) {
        logger.error('Error handling match state change:', error);
    }
});

// Calculate team ELO
function calculateTeamElo(roster) {
    if (!roster || !Array.isArray(roster)) return 0;
    const totalElo = roster.reduce((sum, player) => sum + (player.elo || 0), 0);
    return Math.round(totalElo / roster.length);
}

// Handle chat messages
faceitJS.on('chatMessage', async (message) => {
    try {
        if (!message.room_id || !message.body) return;

        const matchId = message.room_id;
        const matchState = matchStates.get(matchId);

        if (!matchState) return;

        const command = message.body.toLowerCase();
        const playerId = message.user_id;

        if (command === '!rehost') {
            // Handle rehost voting
            matchState.rehostVotes.add(playerId);
            const votesNeeded = 6;
            const currentVotes = matchState.rehostVotes.size;

            await faceitJS.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                body: `Rehost vote: ${currentVotes}/10 players (${votesNeeded} needed)`
            });

            if (currentVotes >= votesNeeded) {
                await faceitJS.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                    body: `✅ Rehost vote passed! Please wait for admin to rehost the match.`
                });
                // Reset votes after passing
                matchState.rehostVotes.clear();
            }
        }
    } catch (error) {
        logger.error('Error handling chat message:', error);
    }
});

// Routes
app.get('/', (req, res) => {
    logger.info('Home route accessed by IP:', req.ip);
    const baseUrl = getBaseUrl();

    const redirectUri = process.env.REDIRECT_URI || `${baseUrl}/callback`;
    const clientId = process.env.CLIENT_ID;
    const authEndpoint = 'https://accounts.faceit.com/oauth/authorize';

    // Construct the authUrl
    const authUrl = `${authEndpoint}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email`;

    // Pass authUrl to the template
    res.render('login', {
        clientId: clientId,
        redirectUri: redirectUri,
        authEndpoint: authEndpoint,
        authUrl: authUrl
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    res.render('dashboard', {
        authenticated: true,
        username: 'FACEIT User',
        userInfo: req.session.userInfo
    });
});

// Error route
app.get('/error', (req, res) => {
    const errorMessage = req.query.error || 'An unknown error occurred';
    res.render('error', {
        message: 'Authentication Error',
        error: errorMessage
    });
});

// Start the server
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});

// Start polling when access token is available
app.use((req, res, next) => {
    if (req.session?.accessToken && !faceitJS.accessToken) {
        faceitJS.setAccessToken(req.session.accessToken);
        faceitJS.startPolling();
        logger.info('Started polling with new access token');
    }
    next();
});

export default app;
