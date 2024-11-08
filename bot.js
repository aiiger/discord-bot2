const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

const app = express();
const port = process.env.PORT || 3000;
const faceitJS = new FaceitJS();

// Redis client setup
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

const initializeApp = async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');

        // Session middleware FIRST
        app.use(session({
            store: new RedisStore({
                client: redisClient,
                prefix: 'faceit:sess:',
                ttl: 86400
            }),
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            name: 'sessionId',
            resave: true,
            rolling: true,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            }
        }));

        // Debug middleware
        app.use((req, res, next) => {
            console.log(`[${req.method}] ${req.path} - SessionID: ${req.sessionID}`);
            console.log('Session data:', req.session);
            next();
        });

        app.use(express.json());

        // Routes
        app.get('/', (req, res) => {
            res.send('<a href="/auth">Login with FACEIT</a>');
        });

        app.get('/auth', async (req, res) => {
            try {
                const state = crypto.randomBytes(32).toString('hex');
                req.session.state = state;
                req.session.stateTimestamp = Date.now();

                // Force session save
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
            console.log('Callback - Session:', req.sessionID, req.session);

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