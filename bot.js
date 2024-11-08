const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

const app = express();
const port = process.env.PORT || 3000;

// Redis client setup
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

const initializeApp = async () => {
    let sessionStore;
    
    try {
        await redisClient.connect();
        sessionStore = new RedisStore({ client: redisClient });
        console.log('Connected to Redis successfully');
    } catch (error) {
        console.warn('Failed to connect to Redis, falling back to MemoryStore:', error);
        sessionStore = new session.MemoryStore();
    }

    // Session middleware
    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    }));

    app.use(express.json());

    const faceitJS = new FaceitJS();

    // Root route
    app.get('/', (req, res) => {
        res.send('<a href="/auth">Login with FACEIT</a>');
    });

    // Auth route
    app.get('/auth', (req, res) => {
        try {
            const state = crypto.randomBytes(16).toString('hex');
            req.session.state = state;
            console.log('Generated state:', state);
            const authUrl = faceitJS.getAuthorizationUrl(state);
            console.log('Auth URL:', authUrl);
            res.redirect(authUrl);
        } catch (error) {
            console.error('Auth error:', error);
            res.status(500).send('Authentication failed');
        }
    });

    // Callback route
    app.get('/callback', async (req, res) => {
        try {
            const { code, state } = req.query;
            console.log('Received state:', state);
            console.log('Session state:', req.session.state);

            if (!state || !req.session.state || state !== req.session.state) {
                console.error('State mismatch', { 
                    receivedState: state, 
                    sessionState: req.session.state 
                });
                return res.status(400).send('Invalid state parameter');
            }

            delete req.session.state;

            const tokenData = await faceitJS.getAccessTokenFromCode(code);
            req.session.accessToken = tokenData.access_token;
            req.session.refreshToken = tokenData.refresh_token;
            
            await new Promise((resolve, reject) => {
                req.session.save(err => err ? reject(err) : resolve());
            });

            res.redirect('/dashboard');
        } catch (error) {
            console.error('Callback error:', error);
            res.status(500).send('Error exchanging authorization code for tokens');
        }
    });

    // Dashboard route
    app.get('/dashboard', async (req, res) => {
        if (!req.session.accessToken) {
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

    // Start server
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};

initializeApp().catch(error => {
    console.error('Failed to initialize app:', error);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    try {
        await redisClient.quit();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

module.exports = app;