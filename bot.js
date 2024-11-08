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
        console.log('Connected to Redis successfully');

        // Security headers
        app.use((req, res, next) => {
            res.set({
                'X-Frame-Options': 'DENY',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            });
            next();
        });

        // Session middleware with secure settings
        app.use(session({
            store: new RedisStore({ 
                client: redisClient,
                prefix: 'faceit:sess:'
            }),
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            name: 'sessionId',
            resave: false,
            saveUninitialized: false,
            rolling: true,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            }
        }));

        app.use(express.json());

        // Debug middleware
        app.use((req, res, next) => {
            console.log('Session ID:', req.sessionID);
            console.log('Session Data:', req.session);
            next();
        });

        // Routes
        app.get('/', (req, res) => {
            req.session.touch();
            res.send('<a href="/auth">Login with FACEIT</a>');
        });

        app.get('/auth', (req, res) => {
            try {
                const state = crypto.randomBytes(32).toString('hex');
                req.session.state = state;
                req.session.stateTimestamp = Date.now();
                
                console.log('Generated state:', state);
                console.log('Session after state set:', req.session);
                
                const authUrl = faceitJS.getAuthorizationUrl(state);
                
                // Force session save before redirect
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.status(500).send('Authentication failed');
                    }
                    console.log('Session saved, redirecting...');
                    res.redirect(authUrl);
                });
            } catch (error) {
                console.error('Auth error:', error);
                res.status(500).send('Authentication failed');
            }
        });

        app.get('/callback', async (req, res) => {
            try {
                const { code, state } = req.query;
                console.log('Received state:', state);
                console.log('Session on callback:', req.session);

                if (!state || !req.session?.state) {
                    console.error('State missing', { 
                        receivedState: state, 
                        sessionState: req.session?.state,
                        sessionID: req.sessionID
                    });
                    return res.status(400).send('Invalid state parameter');
                }

                if (state !== req.session.state) {
                    console.error('State mismatch', { 
                        receivedState: state, 
                        sessionState: req.session.state,
                        sessionID: req.sessionID
                    });
                    return res.status(400).send('State parameter mismatch');
                }

                // Check state age
                const stateAge = Date.now() - req.session.stateTimestamp;
                if (stateAge > 5 * 60 * 1000) { // 5 minutes
                    return res.status(400).send('State parameter expired');
                }

                delete req.session.state;
                delete req.session.stateTimestamp;

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

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
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