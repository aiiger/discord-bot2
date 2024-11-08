const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

const app = express();
const port = process.env.PORT || 3000;
const faceitJS = new FaceitJS();

// 1. Trust Heroku's proxy
app.set('trust proxy', 1);

// 2. Redis client setup
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

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

// 3. Session middleware
const sessionMiddleware = session({
    store: new RedisStore({
        client: redisClient,
        prefix: 'faceit:sess:',
        ttl: 86400 // 1 day
    }),
    secret: process.env.SESSION_SECRET,
    name: 'sessionId',
    resave: false, // Only save session if modified
    saveUninitialized: false, // Don't create session until something stored
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Set to true in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: 'lax' // Adjust based on your requirements
    }
});

app.use(sessionMiddleware);

// 4. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Debug middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - SessionID: ${req.sessionID}`);
    console.log('Session Data:', req.session);
    next();
});

// 6. Routes
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

app.get('/auth', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        req.session.state = state;
        req.session.stateTimestamp = Date.now();

        // Force session save before redirect
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

// 7. Error handler (must have all 4 parameters)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// 8. Start server after initializing Redis
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