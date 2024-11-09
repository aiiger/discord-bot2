// bot.js
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const { FaceitJS } = require('./FaceitJS');

// Validate required environment variables
const requiredEnvVars = [
    'REDIS_URL',
    'SESSION_SECRET',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REDIRECT_URI',
    'HUB_ID'
];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
}

const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

// Handle Redis events
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Session middleware setup
const sessionMiddleware = session({
    store: new RedisStore({
        client: redisClient,
        prefix: 'faceit:sess:',
        ttl: 86400 // 1 day
    }),
    secret: process.env.SESSION_SECRET,
    name: 'sessionId',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

// Middleware
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Constants
const CONFIG_TIME_LIMIT = 5 * 60 * 1000;
const votes = {};
const greetedMatches = new Set();

// Helper functions
const sendMessage = (playerId, messageText) => faceitJS.sendChatMessage(playerId, messageText);

const sendMessageToAll = async (matchId, message) => {
    try {
        const players = await faceitJS.getPlayersInMatch(matchId);
        await Promise.all(players.map(player => sendMessage(player.id, message)));
    } catch (error) {
        console.error(`Error sending message to all players in match ${matchId}:`, error);
    }
};

const handleVote = async (playerId, voteType, matchId) => {
    if (!votes[matchId]) {
        votes[matchId] = {
            rehost: { agree: 0, total: 0 },
            cancel: { agree: 0, total: 0 }
        };
    }

    const match = await faceitJS.getMatchDetails(matchId);
    if (match.state !== 'CONFIGURING') {
        throw new Error('Voting only allowed during config phase');
    }

    votes[matchId][voteType].total += 1;
    votes[matchId][voteType].agree += 1;

    if (votes[matchId][voteType].agree >= 6) {
        if (voteType === 'rehost') {
            await rehostMatch(matchId);
        } else if (voteType === 'cancel') {
            await cancelMatch(matchId);
        }
    }
};

const rehostMatch = async (matchId) => {
    try {
        await faceitJS.rehostMatch(matchId);
        await sendMessageToAll(matchId, 'Match is being rehosted.');
        delete votes[matchId];
    } catch (error) {
        console.error('Rehost error:', error);
        throw error;
    }
};

const cancelMatch = async (matchId) => {
    try {
        await faceitJS.cancelMatch(matchId);
        await sendMessageToAll(matchId, 'Match has been cancelled.');
        delete votes[matchId];
    } catch (error) {
        console.error('Cancel error:', error);
        throw error;
    }
};

// OAuth routes
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

app.get('/auth', (req, res) => {
    const state = crypto.randomBytes(32).toString('hex');
    req.session.state = state;
    const authUrl = faceitJS.getAuthorizationUrl(state);
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        if (state !== req.session.state) {
            return res.status(400).send('Invalid state parameter');
        }

        await faceitJS.exchangeAuthorizationCode(code);
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Authentication failed');
    }
});

// Match state monitoring
faceitJS.onMatchStateChange(async (match) => {
    if (match.state === 'CONFIGURING' && !greetedMatches.has(match.id)) {
        await sendMessageToAll(match.id, 'Config phase started. Use !rehost or !cancel to vote. You have 5 minutes.');
        greetedMatches.add(match.id);
        
        setTimeout(() => {
            if (votes[match.id]) {
                delete votes[match.id];
            }
            greetedMatches.delete(match.id);
        }, CONFIG_TIME_LIMIT);
    }
});

// Voting route
app.post('/vote', async (req, res) => {
    try {
        const { playerId, voteType, matchId } = req.body;
        await handleVote(playerId, voteType, matchId);
        res.status(200).send('Vote registered');
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Server startup
const startServer = async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');
        
        await faceitJS.initialize();
        console.log('FaceitJS initialized');
        
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;