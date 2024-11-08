// bot.js
import express from 'express';
import crypto from 'crypto';
import session from 'express-session';
import dotenv from 'dotenv';
import faceitJS from './FaceitJS.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

// Generate a random string for state
function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}

// Root route
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

// Authentication route
app.get('/auth', (req, res) => {
    const state = generateRandomString(16);
    req.session.state = state;
    const authorizationUrl = faceitJS.getAuthorizationUrl(state);
    res.redirect(authorizationUrl);
});

// Callback route
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    // Verify state parameter
    if (state !== req.session.state) {
        return res.status(400).send('Invalid state parameter');
    }

    // Exchange authorization code for tokens
    try {
        const tokenData = await faceitJS.getAccessTokenFromCode(code);
        req.session.accessToken = tokenData.access_token;
        req.session.refreshToken = tokenData.refresh_token;
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Error exchanging authorization code for tokens');
    }
});

// Protected route
app.get('/dashboard', async (req, res) => {
    const { accessToken } = req.session;
    if (!accessToken) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const userInfo = await faceitJS.getUserInfo(accessToken);
        res.json(userInfo);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error fetching user info');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});