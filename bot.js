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
    },
    retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Initialize app
const initializeApp = async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');

        const sessionStore = new RedisStore({
            client: redisClient,
            prefix: 'faceit:sess:',
            ttl: 86400, // 1 day
            disableTouch: false
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
                sameSite: 'lax',
                path: '/'
            }
        }));

        // Session verification middleware
        app.use((req, res, next) => {
            if (!req.session) {
                return next(new Error('Session not found'));
            }
            next();
        });

        // Auth route
        app.get('/auth', async (req, res) => {
            try {
                await new Promise((resolve) => req.session.reload(resolve));
                
                const state = crypto.randomBytes(32).toString('hex');
                req.session.state = state;
                req.session.stateTimestamp = Date.now();

                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                console.log('Auth - Session saved with state:', state);
                const authUrl = faceitJS.getAuthorizationUrl(state);
                res.redirect(authUrl);
            } catch (error) {
                console.error('Auth error:', error);
                res.status(500).send('Authentication failed');
            }
        });

        // Start server
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to initialize:', error);
        process.exit(1);
    }
};

// Start app with error handling
initializeApp().catch(error => {
    console.error('Failed to initialize app:', error);
    process.exit(1);
});

module.exports = app;