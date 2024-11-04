// bot.js

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import auth from './auth.js';
import FaceitJS from './FaceitJS.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verify required environment variables
const requiredEnvVars = [
    'FACEIT_API_KEY_SERVER',
    'FACEIT_API_KEY_CLIENT',
    'SESSION_SECRET',
    'FACEIT_CLIENT_ID',
    'FACEIT_CLIENT_SECRET',
    'REDIRECT_URI'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize FaceitJS with your API keys
const faceit = new FaceitJS(process.env.FACEIT_API_KEY_SERVER, process.env.FACEIT_API_KEY_CLIENT);

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'faceit.sid'
}));

// Middleware to parse JSON
app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Root Endpoint - Redirect to /auth
app.get('/', (req, res) => {
    res.redirect('/auth');
});

// Auth Endpoint
app.get('/auth', (req, res) => {
    const authUrl = auth.getAuthorizationUrl();
    res.redirect(authUrl);
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

        // Store access token and user info in session
        req.session.accessToken = token.token.access_token;
        req.session.user = userInfoResponse.data;

        console.log('User authenticated:', req.session.user);
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during OAuth callback:', error);
        res.status(500).send('Authentication failed.');
    }
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/auth');
    }
    res.send(`Welcome to your dashboard, ${req.session.user.username}!`);
});

// Rehost Command
app.post('/rehost', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Unauthorized');
    }

    const { gameId, eventId } = req.body;

    if (!gameId || !eventId) {
        return res.status(400).send('Missing gameId or eventId');
    }

    try {
        // Example: Rehost a championship
        const response = await faceit.getChampionshipsById(eventId);
        // Implement your rehosting logic here using FaceitJS methods

        // Placeholder response
        res.status(200).send(`Rehosted event ${eventId} for game ${gameId}`);
    } catch (error) {
        console.error('Error rehosting:', error);
        res.status(500).send('Rehost failed.');
    }
});

// Cancel Command
app.post('/cancel', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Unauthorized');
    }

    const { eventId } = req.body;

    if (!eventId) {
        return res.status(400).send('Missing eventId');
    }

    try {
        // Example: Cancel a championship
        const response = await faceit.getChampionshipsById(eventId);
        // Implement your cancellation logic here using FaceitJS methods

        // Placeholder response
        res.status(200).send(`Canceled event ${eventId}`);
    } catch (error) {
        console.error('Error canceling:', error);
        res.status(500).send('Cancellation failed.');
    }
});

// Health check endpoint for Heroku
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
