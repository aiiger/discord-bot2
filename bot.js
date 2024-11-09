import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import { FaceitJS } from './FaceitJS.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Express
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

// Redis event handlers
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Connect to Redis
await redisClient.connect();

// Initialize FaceitJS instance
const faceitJS = new FaceitJS();

// Session middleware configuration
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

// Apply middleware (only once)
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

export default app;