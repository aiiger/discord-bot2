// FACEIT OAuth2 Bot with SDK Support
const express = require('express');
const session = require('express-session');
const { FaceitJS } = require('./src/FaceitJS.js');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;

dotenv.config();

console.log('Starting bot initialization...');
console.log('Discord Token:', process.env.DISCORD_TOKEN ? '[Present]' : '[Missing]');
console.log('FACEIT API Key:', process.env.FACEIT_API_KEY ? '[Present]' : '[Missing]');
console.log('Hub ID:', process.env.HUB_ID ? '[Present]' : '[Missing]');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REDIRECT_URI:', process.env.REDIRECT_URI);

// Initialize Express
const app = express();

app.set('trust proxy', 1); // Add this line

// Additional error handling
app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`${req.method} ${req.url} ${res.statusCode}`);
    });
    next();
});

// Must be first - trust proxy for Heroku
app.set('trust proxy', 1);

const port = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

console.log('Is Production:', isProduction);

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
    const url = isProduction ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com' : `http://localhost:${port}`;
    console.log('Base URL:', url);
    return url;
};

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();
app.locals.faceitJS = faceitJS;  // Store FaceitJS instance in app.locals

// Store match states and voting
const matchStates = new Map();
// Store processed matches to avoid duplicate greetings
const processedMatches = new Set();

// Initialize Discord client
console.log('Initializing Discord client...');
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
            await app.locals.faceitJS.sendChatMessage(matchId, greetingMessage);
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
        if (!app.locals.faceitJS.accessToken) {
            console.log(`Authentication required. Please visit ${getBaseUrl()} to authenticate the bot.`);
            return;
        }

        const matches = await app.locals.faceitJS.getActiveMatches();
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
        if (error.response?.status === 401) {
            app.locals.faceitJS.accessToken = null;
        }
    }
}

// Start periodic match checking (every 30 seconds)
setInterval(checkMatchesInVeto, 30 * 1000);

// Discord client login
console.log('Attempting Discord login...');
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

    console.log(`Received command: ${command}`);

    try {
        switch (command) {
            case '!sendtest':
                if (args.length < 3) {
                    message.reply('Usage: !sendtest [matchId] [message]');
                    return;
                }

                const matchId = args[1];
                const testMessage = args.slice(2).join(' ');

                if (!app.locals.faceitJS.accessToken) {
                    message.reply(`Please authenticate first by visiting ${getBaseUrl()}`);
                    return;
                }

                try {
                    await app.locals.faceitJS.sendChatMessage(matchId, testMessage);
                    message.reply(`Successfully sent message to match room ${matchId}`);
                    console.log(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
                } catch (error) {
                    if (error.response?.status === 401) {
                        message.reply(`Authentication failed. Please authenticate at ${getBaseUrl()}`);
                        app.locals.faceitJS.accessToken = null;
                    } else {
                        message.reply(`Failed to send message: ${error.message}`);
                    }
                    console.error('[DISCORD] Error sending test message:', error);
                }
                break;

            case '!getmatches':
                console.log('Processing !getmatches command...');
                try {
                    const matches = await app.locals.faceitJS.getActiveMatches();
                    console.log('Retrieved matches:', matches);
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

// Redis configuration - simplified to use URL directly
const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis successfully');
});

// Session middleware configuration
const sessionConfig = {
    store: new RedisStore({ client: redisClient }),
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
const authRouter = require('./src/auth.js');
app.use('/', authRouter);

// Routes
app.get('/', (req, res) => {
    console.log('Home route accessed by IP:', req.ip);
    res.render('login', {
        authenticated: !!app.locals.faceitJS.accessToken,
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
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Starting graceful shutdown...');
    redisClient.quit().then(() => {
        console.log('Redis connection closed');
        process.exit(0);
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;
