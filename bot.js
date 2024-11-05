// bot.js

import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import FaceitJS from './FaceitJS.js';
import RedisStore from 'connect-redis';
import Redis from 'ioredis';
import MemoryStore from 'memorystore';

dotenv.config();

const app = express();
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

const PORT = process.env.PORT || 3000;

// Initialize FaceitJS with your API keys
const faceit = new FaceitJS(process.env.FACEIT_API_KEY_SERVER, process.env.FACEIT_API_KEY_CLIENT);

// Configure session store based on environment
let sessionStore;
if (process.env.NODE_ENV === 'production') {
    const redisClient = new Redis(process.env.REDIS_URL);
    sessionStore = new RedisStore({ client: redisClient });
} else {
    const MemoryStore = require('memorystore')(session);
    sessionStore = new MemoryStore({ checkPeriod: 86400000 }); // prune expired entries every 24h
}

// Session configuration
app.use(session({
    store: sessionStore,
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
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Root Endpoint - Show login page
app.get('/', (req, res) => {
    if (req.session.accessToken) {
        res.redirect('/dashboard');
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>FACEIT Bot</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        text-align: center;
                    }
                    h1 {
                        color: #FF5500;
                    }
                    .login-button {
                        display: inline-block;
                        padding: 10px 20px;
                        background-color: #FF5500;
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>FACEIT Bot</h1>
                <p>Please log in with your FACEIT account to continue.</p>
                <a href="/auth" class="login-button">Login with FACEIT</a>
            </body>
            </html>
        `);
    }
});

// Auth Endpoint
app.get('/auth', (req, res) => {
    try {
        const state = Math.random().toString(36).substring(7);
        req.session.authState = state; // Store state in session
        const authUrl = faceit.getAuthorizationUrl(state);
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
        if (state !== req.session.authState) {
            console.log('Invalid state parameter - possible CSRF attack');
            return res.redirect('/?error=invalid_state');
        }
        delete req.session.authState; // Clean up

        // Exchange code for access token
        const token = await faceit.getAccessTokenFromCode(code);
        console.log('Access token obtained');

        // Use the access token to retrieve user information
        const userInfo = await faceit.getUserInfo(token.access_token);
        console.log('User info retrieved:', userInfo.nickname);

        // Store access token and user info in session
        req.session.accessToken = token.access_token;
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
        return res.redirect('/');
    }
    res.send(`
        <h1>Welcome, ${req.session.user.nickname}!</h1>
        <p>You are now authenticated with FACEIT.</p>
        <h2>Available Commands:</h2>
        <ul>
            <li><strong>Get Hub:</strong> GET /api/hubs/:hubId</li>
            <li><strong>Rehost:</strong> POST /api/championships/rehost</li>
            <li><strong>Cancel:</strong> POST /api/championships/cancel</li>
        </ul>
        <p><a href="/logout" style="color: #FF5500;">Logout</a></p>
    `);
});

// API Routes
const apiRouter = express.Router();
app.use('/api', apiRouter);

// Hub Routes
apiRouter.get('/hubs/:hubId', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in first'
        });
    }

    try {
        const { hubId } = req.params;
        const response = await faceit.getHubsById(hubId);
        res.json(response);
    } catch (error) {
        console.error('Error getting hub:', error);
        res.status(500).json({
            error: 'Hub Error',
            message: 'Failed to get hub information'
        });
    }
});

// Championship Routes
apiRouter.post('/championships/rehost', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in first'
        });
    }

    try {
        const { gameId, eventId } = req.body;

        if (!gameId || !eventId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing gameId or eventId'
            });
        }

        const response = await faceit.getChampionshipsById(eventId);
        res.json({
            message: `Rehosted event ${eventId} for game ${gameId}`,
            data: response
        });
    } catch (error) {
        console.error('Error rehosting:', error);
        res.status(500).json({
            error: 'Rehost Error',
            message: 'Failed to rehost championship'
        });
    }
});

apiRouter.post('/championships/cancel', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in first'
        });
    }

    try {
        const { eventId } = req.body;

        if (!eventId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing eventId'
            });
        }

        const response = await faceit.getChampionshipsById(eventId);
        res.json({
            message: `Canceled event ${eventId}`,
            data: response
        });
    } catch (error) {
        console.error('Error canceling:', error);
        res.status(500).json({
            error: 'Cancel Error',
            message: 'Failed to cancel championship'
        });
    }
});

// Health check endpoint for Heroku
app.get('/health', (_, res) => {
    res.status(200).json({ status: 'OK' });
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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/?message=logged_out');
});