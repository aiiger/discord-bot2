// bot.js

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import session from 'express-session';
import { createClient } from 'redis';
import connectRedis from 'connect-redis';
import path from 'path';
import { fileURLToPath } from 'url';
import auth from './auth.js'; // Ensure you have an auth module as discussed earlier

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis Store
const RedisStore = connectRedis(session);

// Create Redis client with SSL enabled
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false // Set to true in production with valid certificates
    },
});

// Redis event handlers
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

// Connect to Redis
(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Could not connect to Redis:', error);
    }
})();

// Configure session middleware to use Redis
app.use(
    session({
        store: new RedisStore({ client: redisClient }), // Ensure 'new' is used here
        secret: process.env.SESSION_SECRET || 'your-secret-key', // Replace with a strong secret in production
        resave: false,
        saveUninitialized: false,
        cookie: { secure: process.env.NODE_ENV === 'production' },
    })
);

// Middleware to parse JSON
app.use(express.json());

// Routes

// Root Endpoint - Redirect to /auth
app.get('/', (req, res) => {
    res.redirect('/auth');
});

// Auth Endpoint - Redirect to Faceit Authorization URL
app.get('/auth', (req, res) => {
    const authorizationUri = auth.getAuthorizationUrl();
    console.log('Redirecting to:', authorizationUri);
    res.redirect(authorizationUri);
});

// OAuth2 Callback Endpoint
app.get('/callback', async (req, res) => {
    try {
        console.log('Callback received with query:', req.query);
        const { code, state } = req.query;

        if (!code) {
            console.log('No code provided');
            return res.status(400).send('No code provided');
        }

        // Validate state parameter if implemented
        if (!auth.getAuthState().validate(state)) {
            console.log('Invalid state parameter');
            return res.status(400).send('Invalid state parameter');
        }

        // Exchange code for access token
        const token = await auth.getAccessTokenFromCode(code);

        // Use the access token to retrieve user information
        const userInfoResponse = await axios.get(
            'https://api.faceit.com/auth/v1/resources/userinfo',
            {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                },
            }
        );

        console.log('User Info:', userInfoResponse.data);

        res.send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication Successful!</h2>
                    <p>The bot is now authorized to use chat commands.</p>
                    <p>User: ${userInfoResponse.data.username}</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
        `);

        // Start monitoring active matches or perform other post-authentication tasks here

    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication Failed</h2>
                    <p>Error: ${error.message}</p>
                    <p>Please try again.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// Example API Route
app.get('/api/status', (req, res) => {
    res.json({ status: 'Bot is running smoothly!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});