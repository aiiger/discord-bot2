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
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

dotenv.config();

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();

// Must be first - trust proxy for Heroku
app.set('trust proxy', 1);

const port = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDISCLOUD_URL || process.env.REDIS_URL,
    socket: {
        tls: isProduction,
        rejectUnauthorized: false
    }
});

redisClient.on('error', function (err) {
    console.error('Redis Client Error:', err);
});

redisClient.on('connect', function () {
    console.log('Connected to Redis successfully');
});

await redisClient.connect().catch(console.error);

// Initialize Redis store
const redisStore = new RedisStore({
    client: redisClient,
    prefix: "faceit-bot:"
});

// Force HTTPS in production
if (isProduction) {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Get the base URL for the application
const getBaseUrl = () => {
    return isProduction ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com' : `http://localhost:${port}`;
};

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();
app.locals.faceitJS = faceitJS;  // Store FaceitJS instance in app.locals

// Store match states and voting
const matchStates = new Map();
// Store processed matches to avoid duplicate greetings
const processedMatches = new Set();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Function to send greeting message to match room
async function sendGreetingToMatch(matchId, matchDetails) {
    if (!processedMatches.has(matchId)) {
        try {
            const greetingMessage = "👋 Hello! Map veto phase has started. I'm here to assist and monitor the process. Good luck! 🎮";
            await faceitJS.sendChatMessage(matchId, greetingMessage);
            processedMatches.add(matchId);
            console.log(`Sent greeting message to match ${matchId} during veto phase`);
        } catch (error) {
            console.error(`Failed to send greeting to match ${matchId}:`, error);
        }
    }
}

// Function to check for matches in veto phase
async function checkMatchesInVeto() {
    try {
        if (!faceitJS.accessToken) {
            console.log(`Authentication required. Please visit ${getBaseUrl()} to authenticate the bot.`);
            return;
        }

        const matches = await faceitJS.getHubMatches(faceitJS.hubId);
        if (matches && matches.length > 0) {
            for (const match of matches) {
                // Check if match is in veto phase (VOTING state)
                if (match.status === 'VOTING' || match.state === 'VOTING') {
                    await sendGreetingToMatch(match.match_id, match);
                }
            }
        }
    } catch (error) {
        console.error('Error checking for matches in veto phase:', error);
    }
}

// Start periodic match checking (every 30 seconds)
setInterval(checkMatchesInVeto, 30 * 1000);

// Discord client login
client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log('Discord bot logged in successfully');
    // Initial check for matches after successful login
    checkMatchesInVeto();
}).catch(error => {
    console.error('Failed to log in to Discord:', error);
});

// Discord client ready event
client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
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
                    message.reply(`Please authenticate first by visiting ${getBaseUrl()}`);
                    return;
                }

                try {
                    await faceitJS.sendChatMessage(matchId, testMessage);
                    message.reply(`Successfully sent message to match room ${matchId}`);
                    console.log(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
                } catch (error) {
                    if (error.response?.status === 401) {
                        message.reply(`Authentication failed. Please authenticate at ${getBaseUrl()}`);
                        faceitJS.accessToken = null;
                    } else {
                        message.reply(`Failed to send message: ${error.message}`);
                    }
                    console.error('[DISCORD] Error sending test message:', error);
                }
                break;

            case '!getmatches':
                try {
                    const matches = await faceitJS.getHubMatches(faceitJS.hubId);
                    if (matches && matches.length > 0) {
                        const matchList = matches.slice(0, 5).map(match =>
                            `Match ID: ${match.match_id}\n` +
                            `Status: ${match.state || 'Unknown'}\n` +
                            `Room: ${match.chat_room_id || 'No room'}\n`
                        ).join('\n');

                        message.reply(`Recent matches:\n${matchList}\n\nUse !sendtest [matchId] [message] to test sending a message.`);
                        console.log('[DISCORD] Retrieved matches:', { count: matches.length });
                    } else {
                        message.reply('No recent matches found.');
                        console.log('[DISCORD] No matches found');
                    }
                } catch (error) {
                    message.reply('Error getting matches: ' + error.message);
                    console.error('Error getting matches:', error);
                }
                break;

            case '!auth':
                const authUrl = `${getBaseUrl()}/auth/faceit`;
                message.reply(`Please visit ${authUrl} to authenticate the bot`);
                break;

            case '!testhelp':
                const helpMessage = `
Available test commands:
!getmatches - Get recent matches from your hub
!sendtest [matchId] [message] - Send a custom message to match chat
!auth - Get the authentication URL

Example:
1. Use !auth to get the authentication URL
2. Use !getmatches to get match IDs
3. Use !sendtest with a match ID to test messaging
`;
                message.reply(helpMessage);
                break;
        }
    } catch (error) {
        console.error('[DISCORD] Error executing command:', error);
        message.reply(`Failed to execute command: ${error.message}`);
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
    skip: (req) => {
        // Skip rate limiting for local development
        return !isProduction;
    }
});

// Session middleware configuration
const sessionConfig = {
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    name: 'faceit.sid',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    rolling: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
    }
};

// Apply middleware
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(limiter);
app.use(session(sessionConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import and use auth routes
import authRouter from './auth.js';
app.use('/', authRouter);

// Routes
app.get('/', (req, res) => {
    console.log('Home route accessed by IP:', req.ip);
    res.render('login', {
        authenticated: !!faceitJS.accessToken,
        baseUrl: getBaseUrl()
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    res.render('dashboard', {
        authenticated: true,
        username: req.session.userInfo?.nickname || 'FACEIT User',
        userInfo: req.session.userInfo
    });
});

// Error route
app.get('/error', (req, res) => {
    const errorMessage = req.query.error || 'An unknown error occurred';
    res.render('error', { message: 'Authentication Error', error: errorMessage });
});

// Handle 404
app.use((req, res) => {
    res.status(404).render('error', {
        message: 'Page Not Found',
        error: 'The requested page does not exist.'
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Starting graceful shutdown...');
    // Close Redis connection
    await redisClient.quit();
    process.exit(0);
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

export default app;
