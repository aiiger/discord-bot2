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

// Session middleware with proper configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Root route
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

// Authentication route
app.get('/auth', (req, res) => {
    try {
        const state = crypto.randomBytes(16).toString('hex');
        req.session.state = state;
        const authorizationUrl = faceitJS.getAuthorizationUrl(state);
        console.log('Auth URL:', authorizationUrl);
        console.log('State saved in session:', state);
        res.redirect(authorizationUrl);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Authentication failed');
    }
});

// Callback route
app.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        console.log('Received state:', state);
        console.log('Session state:', req.session.state);

        if (!state || !req.session.state || state !== req.session.state) {
            console.error('State mismatch', { 
                receivedState: state, 
                sessionState: req.session.state 
            });
            return res.status(400).send('Invalid state parameter');
        }

        // Clear the state from session
        delete req.session.state;

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
    if (!req.session.accessToken) {
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

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});