// FACEIT Bot with Data API Support
const express = require('express');
const session = require('express-session');
const { FaceitJS } = require('./FaceitJS.js');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config();

console.log('Starting bot initialization...');
console.log('Discord Token:', process.env.DISCORD_TOKEN ? '[Present]' : '[Missing]');
console.log('FACEIT API Key:', process.env.FACEIT_API_KEY ? '[Present]' : '[Missing]');
console.log('Hub ID:', process.env.HUB_ID ? '[Present]' : '[Missing]');
console.log('NODE_ENV:', process.env.NODE_ENV);

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;
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
app.set('views', path.join(__dirname, '..', 'views'));

// Initialize FaceitJS instance with app
const faceitJS = new FaceitJS(app);
app.locals.faceitJS = faceitJS;

// Store processed matches to avoid duplicate greetings
const processedMatches = new Set();

// Function to send greeting message to match room
async function sendGreetingToMatch(matchId, matchDetails) {
    if (!processedMatches.has(matchId)) {
        try {
            console.log(`[MATCH ${matchId}] Attempting to send greeting message`);
            const greetingMessage = "👋 Hello! Map veto phase has started. I'm here to assist and monitor the process. Good luck! 🎮\n\nAvailable commands:\n!rehost - Vote for match rehost (requires 6/10 players)\n!cancel - Request match cancellation (requires elo differential ≥70)";
            const result = await app.locals.faceitJS.sendChatMessage(matchId, greetingMessage);

            if (result.needsAuth) {
                console.log(`[MATCH ${matchId}] Authentication needed for greeting`);
                // We'll handle auth separately
                return;
            }

            processedMatches.add(matchId);
            console.log(`[MATCH ${matchId}] Greeting message sent successfully`);
        } catch (error) {
            console.error(`[MATCH ${matchId}] Failed to send greeting:`, error);
        }
    }
}

// Function to check for matches in veto phase
async function checkMatchesInVeto() {
    try {
        console.log('[MATCHES] Checking for active matches...');
        const matches = await app.locals.faceitJS.getActiveMatches();
        console.log(`[MATCHES] Found ${matches ? matches.length : 0} active matches`);

        if (matches && matches.length > 0) {
            for (const match of matches) {
                console.log(`[MATCH ${match.match_id}] Status: ${match.status || match.state}`);
                // Check if match is in veto phase (READY or VOTING state)
                if (match.status === 'READY' || match.status === 'VOTING' || match.state === 'READY' || match.state === 'VOTING') {
                    console.log(`[MATCH ${match.match_id}] Match is in veto phase`);
                    await sendGreetingToMatch(match.match_id, match);
                }
            }
        }
    } catch (error) {
        console.error('[MATCHES] Error checking matches:', error);
    }
}

// Start periodic match checking (every 30 seconds)
setInterval(checkMatchesInVeto, 30 * 1000);

// Initialize Discord client
console.log('Initializing Discord client...');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

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

    console.log(`[DISCORD] Received command: ${command}`);

    try {
        switch (command) {
            case '!sendtest':
                if (args.length < 3) {
                    message.reply('Usage: !sendtest [matchId] [message]');
                    return;
                }

                const matchId = args[1];
                const testMessage = args.slice(2).join(' ');

                try {
                    const result = await app.locals.faceitJS.sendChatMessage(matchId, testMessage);

                    if (result.needsAuth) {
                        message.reply(`Please visit this URL to authorize the bot:\n${result.authUrl}`);
                    } else {
                        message.reply(`Successfully sent message to match room ${matchId}`);
                    }

                    console.log(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
                } catch (error) {
                    message.reply(`Failed to send message: ${error.message}`);
                    console.error('[DISCORD] Error sending test message:', error);
                }
                break;

            case '!getmatches':
                console.log('[DISCORD] Processing !getmatches command');
                try {
                    const matches = await app.locals.faceitJS.getActiveMatches();
                    console.log('[DISCORD] Retrieved matches:', matches);
                    if (matches && matches.length > 0) {
                        const matchList = matches.slice(0, 5).map(match => {
                            const matchUrl = match.faceit_url.replace('{lang}', 'en');
                            return `Match ID: ${match.match_id}\n` +
                                `Status: ${match.status || 'Unknown'}\n` +
                                `Room: ${matchUrl}\n`;
                        }).join('\n');

                        message.reply(`Recent matches:\n${matchList}\n\nUse !sendtest [matchId] [message] to test sending a message.`);
                        console.log('[DISCORD] Retrieved matches:', { count: matches.length });
                    } else {
                        message.reply('No recent matches found.');
                        console.log('[DISCORD] No matches found');
                    }
                } catch (error) {
                    message.reply('Error getting matches: ' + error.message);
                    console.error('[DISCORD] Error getting matches:', error);
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
        console.error('[DISCORD] Error executing command:', error);
        message.reply(`Failed to execute command: ${error.message}`);
    }
});

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for local development
        return !isProduction;
    }
});

// Session middleware configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'development_secret',
    name: 'faceit.sid',
    resave: false,
    saveUninitialized: false,
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
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "*.faceit.com", "*.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "*.faceit.com", "*.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "*.faceit.com", "*.cloudflare.com"],
            imgSrc: ["'self'", "data:", "*.faceit.com", "*.cloudflare.com"],
            connectSrc: ["'self'", "*.faceit.com", "*.cloudflare.com"],
            frameSrc: ["'self'", "*.faceit.com", "*.cloudflare.com"],
            workerSrc: ["'self'", "blob:", "*.faceit.com", "*.cloudflare.com"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));
app.use(limiter);
app.use(session(sessionConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.render('login', {
        authenticated: true,
        baseUrl: isProduction ? process.env.REDIRECT_URI : `http://localhost:${port}`
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.render('dashboard', {
        authenticated: true,
        username: 'FACEIT User'
    });
});

// Error route
app.get('/error', (req, res) => {
    const errorMessage = req.query.error || 'An unknown error occurred';
    console.error('[ERROR] Error page accessed:', errorMessage);
    res.render('error', { message: 'Error', error: errorMessage });
});

// Handle 404
app.use((req, res) => {
    console.log('[ERROR] 404 - Page not found:', req.url);
    res.status(404).render('error', {
        message: 'Page Not Found',
        error: 'The requested page does not exist.'
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;
