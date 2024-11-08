// bot.js
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS'); // Ensure correct path

const app = express();
const port = process.env.PORT || 3000;
const faceitJS = new FaceitJS(); // Correct instantiation

// Configure Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

// Handle Redis client events
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Initialize Redis connection
const initializeRedis = async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');
    } catch (error) {
        console.error('Redis connection error:', error);
        process.exit(1);
    }
};

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
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware (optional)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - SessionID: ${req.sessionID}`);
    console.log('Session Data:', req.session);
    next();
});

// Function to send messages to a single player
const sendMessage = (playerId, message) => {
    // Implement message sending via FACEIT API or chat system
    faceitJS.sendChatMessage(playerId, message);
};

// Function to send messages to all players in a match
const sendMessageToAll = async (matchId, message) => {
    try {
        const players = await faceitJS.getPlayersInMatch(matchId);
        players.forEach(player => {
            sendMessage(player.id, message);
        });
    } catch (error) {
        console.error(`Error fetching players for match ${matchId}:`, error);
    }
};

// Function to greet players
const greetPlayers = (players) => {
    players.forEach(player => {
        sendMessage(player.id, 'Welcome to the match! Good luck!');
    });
};

// Voting mechanism for rehosting
const votes = {};

app.post('/vote', (req, res) => {
    const { playerId, vote, matchId } = req.body;
    handleVote(playerId, vote, matchId);
    res.status(200).send('Vote registered');
});

const handleVote = (playerId, vote, matchId) => {
    if (!votes[matchId]) {
        votes[matchId] = { agree: 0, total: 0 };
    }
    votes[matchId].total += 1;
    if (vote === 'agree') {
        votes[matchId].agree += 1;
    }

    if (votes[matchId].agree >= 6) {
        rehostMatch(matchId);
    }
};

const rehostMatch = async (matchId) => {
    try {
        await faceitJS.rehostMatch(matchId);
        await sendMessageToAll(matchId, 'Rehosting the match as per player votes.');
    } catch (error) {
        console.error('Rehosting error:', error);
    }
};

// Check Elo differential and cancel match if necessary
const checkEloDifferential = async (matchId) => {
    try {
        const players = await faceitJS.getPlayersInMatch(matchId);
        const eloScores = players.map(p => p.elo);
        const maxElo = Math.max(...eloScores);
        const minElo = Math.min(...eloScores);
        const diff = maxElo - minElo;

        if (diff >= 70) {
            cancelMatch(matchId);
        }
    } catch (error) {
        console.error(`Error checking Elo differential for match ${matchId}:`, error);
    }
};

const cancelMatch = async (matchId) => {
    try {
        await faceitJS.cancelMatch(matchId);
        await sendMessageToAll(matchId, 'Match has been cancelled due to high Elo differential.');
    } catch (error) {
        console.error('Cancelling match error:', error);
    }
};

// Track matches that have been greeted to avoid duplicate greetings
const greetedMatches = new Set();

// Register event listener for match state changes
faceitJS.onMatchStateChange(async (match) => {
    if (match.state === 'config' && !greetedMatches.has(match.id)) {
        await greetPlayers(match.players);
        greetedMatches.add(match.id);
    }

    // Check Elo differential
    await checkEloDifferential(match.id);
});

// Routes
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

app.get('/auth', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        req.session.state = state;
        req.session.stateTimestamp = Date.now();

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    reject(err);
                } else {
                    console.log('Session saved successfully');
                    resolve();
                }
            });
        });

        console.log('Auth - Generated state:', state);
        const authUrl = faceitJS.getAuthorizationUrl(state);
        res.redirect(authUrl);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Authentication failed');
    }
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    console.log('Callback - Received state:', state);
    console.log('Callback - Session state:', req.session?.state);

    if (!state || !req.session?.state || state !== req.session.state) {
        console.error('State mismatch:', {
            received: state,
            stored: req.session?.state,
            sessionId: req.sessionID
        });
        return res.status(400).send('Invalid state parameter');
    }

    try {
        const tokenData = await faceitJS.getAccessTokenFromCode(code);
        req.session.accessToken = tokenData.access_token;
        req.session.refreshToken = tokenData.refresh_token;
        delete req.session.state;
        delete req.session.stateTimestamp;

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Error processing callback');
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session?.accessToken) {
        return res.redirect('/');
    }

    try {
        const userInfo = await faceitJS.getUserInfo(req.session.accessToken);
        res.json(userInfo);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error fetching user info');
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server after initializing Redis
const startServer = async () => {
    await initializeRedis();
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
};

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;