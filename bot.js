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
    },
    debug: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] DEBUG: ${message}`);
        if (data) {
            console.log('Debug data:', JSON.stringify(data, null, 2));
        }
    }
};

// Initialize Express
const app = express();

// Must be first - trust proxy for Heroku
app.enable('trust proxy');

const port = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

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
                    await faceitJS.sendChatMessage(matchId, testMessage);
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
                        const matchList = matches.slice(0, 5).map(match =>
                            `Match ID: ${match.match_id}\n` +
                            `Status: ${match.state || 'Unknown'}\n` +
                            `Room: ${match.chat_room_id || 'No room'}\n`
                        ).join('\n');

                        message.reply(`Recent matches:\n${matchList}\n\nUse !sendtest [matchId] [message] to test sending a message.`);
                        logger.info('[DISCORD] Retrieved matches:', { count: matches.length });
                    } else {
                        message.reply('No recent matches found.');
                        logger.info('[DISCORD] No matches found');
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
        logger.error('[DISCORD] Error executing command:', error);
        message.reply(`Failed to execute command: ${error.message}`);
    }
});

// Rate limiting configuration for Heroku
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// Session middleware configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    name: 'faceit.sid',
    resave: true,  // Changed to true to ensure session is saved
    saveUninitialized: true,  // Changed to true to ensure session is created
    proxy: true,
    rolling: true,  // Reset expiration on each request
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'  // Ensure cookie is available for all paths
    }
};

if (isProduction) {
    app.set('trust proxy', 1);  // Trust first proxy, required for secure cookie handling
    sessionConfig.cookie.secure = true;  // Ensure cookie is secure in production
}

// Apply middleware
app.use(helmet({
    contentSecurityPolicy: false  // Disable CSP for now to ensure callback works
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

// Routes
app.get('/', (req, res) => {
    logger.info('Home route accessed by IP:', req.ip);
    res.render('login');
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

// Start the server
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    logger.info(`Base URL: ${getBaseUrl()}`);
});

export default app;
