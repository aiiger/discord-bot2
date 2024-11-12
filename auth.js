import express from 'express';
import axios from 'axios';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/auth/callback'
};

// Login route - renders the login page with FACEIT SDK
router.get('/auth/faceit', (req, res) => {
    try {
        console.info('[' + new Date().toISOString() + '] INFO: GET /auth/faceit - IP:', req.ip);
        // Pass the client ID and redirect URI to the login page
        res.render('login', {
            clientId: config.clientId,
            redirectUri: config.redirectUri
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
    }
});

// Handle token from FACEIT SDK
router.post('/auth/callback', async (req, res) => {
    try {
        console.info('Received callback with body:', JSON.stringify(req.body));
        const { token } = req.body;

        if (!token) {
            throw new Error('No token provided');
        }

        // Store token in session
        req.session.accessToken = token;

        // Save session
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).json({ error: 'Failed to save session' });
            }

            console.info('Successfully stored access token in session');
            res.json({ success: true, redirect: '/dashboard' });
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(401).json({ error: error.message });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

export default router;
