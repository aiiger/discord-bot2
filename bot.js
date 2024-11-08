const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', err => console.error('Redis Client Error:', err));
redisClient.connect().catch(console.error);

// Session middleware configuration
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(express.json());

// Initialize FACEIT client
const faceitJS = new FaceitJS();

// Routes
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

app.get('/auth', async (req, res) => {
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

        // Clear state from session
        delete req.session.state;

        // Exchange code for tokens
        const tokenData = await faceitJS.getAccessTokenFromCode(code);
        req.session.accessToken = tokenData.access_token;
        req.session.refreshToken = tokenData.refresh_token;
        
        // Save session before redirect
        await new Promise((resolve, reject) => {
            req.session.save(err => err ? reject(err) : resolve());
        });

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Error exchanging authorization code for tokens');
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }

    try {
        const userInfo = await faceitJS.getUserInfo(req.session.accessToken);
        res.json(userInfo);
    } catch (error) {
        if (error.response?.status === 401 && req.session.refreshToken) {
            try {
                // Try to refresh the token
                const tokenData = await faceitJS.refreshAccessToken(req.session.refreshToken);
                req.session.accessToken = tokenData.access_token;
                req.session.refreshToken = tokenData.refresh_token;
                
                // Retry getting user info with new token
                const userInfo = await faceitJS.getUserInfo(req.session.accessToken);
                return res.json(userInfo);
            } catch (refreshError) {
                console.error('Token refresh error:', refreshError);
                return res.redirect('/');
            }
        }
        console.error('Dashboard error:', error);
        res.status(500).send('Error fetching user info');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;