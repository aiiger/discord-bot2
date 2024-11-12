// FACEIT OAuth2 Bot with PKCE Support
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

// Store for rehost votes and match states
const rehostVotes = new Map(); // matchId -> Set of player IDs who voted
const matchStates = new Map(); // matchId -> match state
const greetedMatches = new Set(); // Set of match IDs that have been greeted
const pendingMessages = new Map(); // Store pending messages while authenticating

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Force production mode for Heroku
const isProduction = process.env.NODE_ENV === 'production';

// Get the base URL for the application
const getBaseUrl = (req) => {
    if (isProduction) {
        return 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com';
    }
    return `http://localhost:${port}`;
};

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    trustProxy: true // Trust Heroku's proxy
});

// Session middleware configuration
const sessionConfig = {
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
};

// Apply middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https://*.faceit.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://*.faceit.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://*.faceit.com"],
            imgSrc: ["'self'", "data:", "https:", "https://*.faceit.com", "https://cdn.faceit.com"],
            connectSrc: ["'self'", "https://*.faceit.com", "https://api.faceit.com", "https://open.faceit.com"],
            fontSrc: ["'self'", "https://*.faceit.com"],
            formAction: ["'self'", "https://*.faceit.com"],
            frameSrc: ["'self'", "https://*.faceit.com"]
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

app.use(session(sessionConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Handle Discord messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!sendtest')) {
        const args = message.content.split(' ');

        if (args.length < 3) {
            message.reply('Usage: !sendtest [matchId] [message]');
            return;
        }

        const matchId = args[1];
        const testMessage = args.slice(2).join(' ');

        try {
            if (!faceitJS.accessToken) {
                const state = crypto.randomBytes(32).toString('hex');
                const redirectUri = isProduction
                    ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback'
                    : `http://localhost:${port}/callback`;
                const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state, redirectUri);

                pendingMessages.set(state, {
                    matchId,
                    message: testMessage,
                    discordMessage: message,
                    codeVerifier,
                    timestamp: Date.now()
                });

                logger.info(`Stored pending message for state ${state}:`, {
                    matchId,
                    message: testMessage
                });

                message.reply(`Please authenticate first by visiting: ${url}`);
                return;
            }

            const response = await faceitJS.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                body: testMessage
            });
            message.reply(`Successfully sent message to match room ${matchId}`);
            logger.info(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
        } catch (error) {
            if (error.response?.status === 401) {
                message.reply('Authentication failed. Please try authenticating again.');
                faceitJS.accessToken = null;
                faceitJS.refreshToken = null;
            } else {
                message.reply(`Failed to send message: ${error.message}`);
            }
            logger.error('[DISCORD] Error sending test message:', error);
        }
    }
});

// Routes
app.get('/', (req, res) => {
    logger.info('Home route accessed by IP:', req.ip);
    res.render('login');
});

app.get('/auth/faceit', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const redirectUri = isProduction
            ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback'
            : `http://localhost:${port}/callback`;
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state, redirectUri);

        // Store PKCE verifier in session
        req.session.codeVerifier = codeVerifier;
        req.session.state = state;

        logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
        logger.info('Generated authorization URL with PKCE');
        res.redirect(url);
    } catch (error) {
        logger.error('Error in auth route:', error);
        res.status(500).render('error', { message: 'Authentication failed' });
    }
});

// Callback handler
async function handleCallback(req, res) {
    const { code, state } = req.query;

    logger.info(`Callback received - Session ID: ${req.session.id}`);
    logger.info(`State from query: ${state}`);
    logger.info(`Code from query: ${code ? '[PRESENT]' : '[MISSING]'}`);

    try {
        // Validate state
        if (!state || state !== req.session.state) {
            throw new Error('Invalid state parameter');
        }

        // Get stored code verifier
        const codeVerifier = req.session.codeVerifier;
        if (!codeVerifier) {
            throw new Error('No code verifier found in session');
        }

        // Exchange code for tokens
        const redirectUri = isProduction
            ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback'
            : `http://localhost:${port}/callback`;
        await faceitJS.exchangeCodeForToken(code, codeVerifier, redirectUri);
        logger.info('Successfully authenticated with FACEIT');

        // Handle pending message if exists
        const pendingMessage = pendingMessages.get(state);
        if (pendingMessage) {
            try {
                await faceitJS.chatApiInstance.post(`/rooms/${pendingMessage.matchId}/messages`, {
                    body: pendingMessage.message
                });
                await pendingMessage.discordMessage.reply(`Successfully sent message to match room ${pendingMessage.matchId}`);
                pendingMessages.delete(state);
                logger.info(`Sent pending message for state ${state}`);
            } catch (error) {
                logger.error('Error sending pending message:', error);
            }
        }

        res.render('dashboard', {
            authenticated: true,
            username: 'FACEIT User'
        });
    } catch (error) {
        logger.error('Error during callback:', error);
        res.status(500).render('error', {
            message: 'Authentication failed',
            error: error.message
        });
    }
}

app.get('/callback', handleCallback);

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

// Start server and login to Discord
Promise.all([
    new Promise((resolve) => {
        const server = app.listen(port, () => {
            logger.info(`Server running on port ${port}`);
            resolve(server);
        });
    }),
    client.login(process.env.DISCORD_TOKEN).then(() => {
        logger.info('Discord bot logged in successfully');
        faceitJS.startPolling();
        logger.info('Started FACEIT match state polling');
    })
]).catch(error => {
    logger.error('Failed to start services:', error);
    process.exit(1);
});

export default app;
