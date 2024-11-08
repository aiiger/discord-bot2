const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

const app = express();
const port = process.env.PORT || 3000;
const faceitJS = new FaceitJS();

// Redis client setup with retry strategy
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    },
    retryStrategy: function(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

const initializeApp = async () => {
    try {
        await redisClient.connect();
        
        // Session store with debug logging
        const sessionStore = new RedisStore({ 
            client: redisClient,
            prefix: 'faceit:sess:',
            logErrors: true
        });

        // Session middleware
        app.use(session({
            store: sessionStore,
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            name: 'sessionId',
            resave: true,
            saveUninitialized: false,
            rolling: true,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            }
        }));

        // Debug middleware
        app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
            console.log('Session ID:', req.sessionID);
            console.log('Session Data:', req.session);
            next();
        });

        app.get('/', (req, res) => {
            res.send('<a href="/auth">Login with FACEIT</a>');
        });

        app.get('/auth', async (req, res) => {
            try {
                const state = crypto.randomBytes(32).toString('hex');
                req.session.state = state;
                req.session.stateTimestamp = Date.now();
                
                console.log('Auth - Generated state:', state);
                
                // Wait for session save
                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                console.log('Auth - Session saved, state:', req.session.state);
                const authUrl = faceitJS.getAuthorizationUrl(state);
                res.redirect(authUrl);
            } catch (error) {
                console.error('Auth error:', error);
                res.status(500).send('Authentication failed');
            }
        });

        app.get('/callback', async (req, res) => {
            try {
                const { code, state } = req.query;
                console.log('Callback - Received state:', state);
                console.log('Callback - Session state:', req.session?.state);

                if (!state || !req.session?.state) {
                    console.error('State missing', { 
                        receivedState: state, 
                        sessionState: req.session?.state,
                        sessionID: req.sessionID
                    });
                    return res.status(400).send('Invalid state parameter');
                }

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

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to initialize:', error);
        process.exit(1);
    }
};

initializeApp().catch(error => {
    console.error('Failed to initialize app:', error);
    process.exit(1);
});

module.exports = app;