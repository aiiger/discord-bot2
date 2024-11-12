import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback',
    // Use the correct FACEIT endpoints
    authEndpoint: 'https://api.faceit.com/auth/v1/oauth/authorize',
    tokenEndpoint: 'https://api.faceit.com/auth/v1/oauth/token'
};

// Create Basic Auth header for client authentication
const getBasicAuthHeader = () => {
    const credentials = `${config.clientId}:${config.clientSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
};

// Generate a random state
const generateState = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Login route - renders the login page
router.get('/auth/faceit', (req, res) => {
    try {
        console.info('[' + new Date().toISOString() + '] INFO: GET /auth/faceit - IP:', req.ip);

        // Generate state for CSRF protection
        const state = generateState();
        req.session.oauthState = state;

        // Build the authorization URL with required parameters
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'profile email',
            state: state
        });

        const authUrl = `${config.authEndpoint}?${params.toString()}`;
        console.info('Generated auth URL:', authUrl);

        res.render('login', {
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            authUrl: authUrl
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
    }
});

// Handle OAuth callback with authorization code
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            throw new Error(error_description || error);
        }

        if (!code) {
            throw new Error('No authorization code received');
        }

        // Verify state to prevent CSRF
        if (state !== req.session.oauthState) {
            throw new Error('Invalid state parameter');
        }

        console.info('Received authorization code:', code);

        // Exchange the authorization code for tokens
        const tokenResponse = await axios.post(config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: config.clientId,
                redirect_uri: config.redirectUri
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': getBasicAuthHeader(),
                    'Accept': 'application/json'
                }
            }
        );

        console.info('Token exchange successful');

        // Store access token in session
        req.session.accessToken = tokenResponse.data.access_token;
        req.session.oauthState = null; // Clear the state

        // Save session and redirect
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.redirect('/error?error=Failed to save session');
            }

            console.info('Successfully stored access token in session');
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Error in callback:', error);
        if (error.response) {
            console.error('Error response:', error.response.data);
        }
        res.redirect('/error?error=' + encodeURIComponent(error.message));
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
