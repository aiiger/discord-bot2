// bot.js

import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
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
    'REDIRECT_URI'  // Now required
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

// Root Endpoint - Show login page
app.get('/', (req, res) => {
    if (req.session.accessToken) {
        res.redirect('/dashboard');
    } else {
        res.send(`
            <h1>FACEIT Bot</h1>
            <p>Please log in with your FACEIT account to continue.</p>
            <a href="/auth" style="
                display: inline-block;
                padding: 10px 20px;
                background-color: #FF5500;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                font-family: Arial, sans-serif;
            ">Login with FACEIT</a>
        `);
    }
});

// Auth Endpoint
app.get('/auth', (req, res) => {
    try {
        const authUrl = faceit.getAuthorizationUrl();
        console.log('Redirecting to FACEIT auth URL:', authUrl);
        res.redirect(authUrl);
    } catch (error) {
        console.error('Error generating auth URL:', error);
        res.status(500).send('Authentication initialization failed.');
    }
});

// OAuth2 Callback Endpoint
app.get('/callback', async (req, res) => {
    try {
        console.log('Callback received with query:', req.query);
        const { code, state } = req.query;

        if (!code) {
            console.log('No code provided - redirecting to login');
            return res.redirect('/?error=no_code');
        }

        // Validate state parameter
        if (!faceit.validateState(state)) {
            console.log('Invalid state parameter - possible CSRF attack');
            return res.redirect('/?error=invalid_state');
        }

        // Exchange code for access token
        const token = await faceit.getAccessTokenFromCode(code);
        console.log('Access token obtained');

        // Use the access token to retrieve user information
        const userInfo = await faceit.getUserInfo(token.token.access_token);
        console.log('User info retrieved:', userInfo.nickname);

        // Store access token and user info in session
        req.session.accessToken = token.token.access_token;
        req.session.user = userInfo;

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during OAuth callback:', error);
        res.redirect('/?error=auth_failed');
    }
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/?error=not_authenticated');
    }

    res.send(`
        <h1>Welcome, ${req.session.user.nickname}!</h1>
        <p>You are now authenticated with FACEIT.</p>
        <h2>Available Commands:</h2>
        <ul>
            <li><strong>Rehost:</strong> POST /rehost with gameId and eventId</li>
            <li><strong>Cancel:</strong> POST /cancel with eventId</li>
        </ul>
        <p><a href="/logout" style="color: #FF5500;">Logout</a></p>
    `);
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/?message=logged_out');
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
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Redirect URI: ${process.env.REDIRECT_URI}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
