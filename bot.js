const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const FaceitJS = require('./FaceitJS');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis client with SSL configuration
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    },
    legacyMode: false
});

// Connect to Redis with fallback
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

    // Session middleware configuration (only once)
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

    // Initialize FACEIT client
    const faceitJS = new FaceitJS();

    // Routes
    app.get('/', (req, res) => {
        res.send('<a href="/auth">Login with FACEIT</a>');
    });

    // Start server
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};

// Initialize app with error handling
initializeApp().catch(error => {
    console.error('Failed to initialize app:', error);
    process.exit(1);
});

// Graceful shutdown
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