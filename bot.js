// bot.js

import Redis from 'ioredis';
import session from 'express-session';
import RedisStore from 'connect-redis';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis client
const redisClient = new Redis(process.env.REDIS_URL, {
    tls: {
        // **Important:** Do not disable certificate validation in production
        rejectUnauthorized: true, // Ensures certificates are valid and trusted
    },
});

// Handle Redis connection errors
redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
});

// Initialize session store
const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'faceit:sess:',
});

// Middleware to enhance security
app.use(helmet());

// Middleware to parse JSON
app.use(express.json());

// Middleware to handle sessions
app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Ensures HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    name: 'faceit.sid'
}));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: isProduction ? 'Something went wrong' : err.message
    });
});

// Root Endpoint - Show login page
app.get('/', (req, res) => {
    if (req.session.accessToken) {
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: req.query.error, message: req.query.message });
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
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('FACEIT Error:', error, error_description);
            return res.redirect(`/?error=${encodeURIComponent(error_description)}`);
        }

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
        return res.redirect('/?error=not_authenticated');
    }

    res.render('dashboard', { user: req.session.user });
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('faceit.sid');
        res.redirect('/?message=logged_out');
    });
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
        const response = await faceit.getHubMatches(hubId);
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

        const response = await faceit.getHubMatches(eventId);
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

        const response = await faceit.getHubMatches(eventId);
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
app.get('/health', (req, res) => {
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
