import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback',
    authEndpoint: 'https://accounts.faceit.com/oauth/authorize',
    tokenEndpoint: 'https://api.faceit.com/auth/v1/oauth/token',
    userInfoEndpoint: 'https://api.faceit.com/users/v1/oauth/userinfo'
};

// Authorization route - initiates OAuth2 flow
router.get('/auth/faceit', async (req, res) => {
    try {
        // Generate state for security
        const state = crypto.randomBytes(16).toString('hex');
        req.session.state = state;

        // Build authorization URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'openid profile email',
            state: state
        });

        const authUrl = `${config.authEndpoint}?${params.toString()}`;

        // Set required headers
        res.set({
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Error initiating OAuth flow:', error);
        res.redirect('/error?error=' + encodeURIComponent('Failed to initiate authentication'));
    }
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        // Check for OAuth errors
        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        // Verify state parameter
        if (!state || state !== req.session.state) {
            throw new Error('Invalid state parameter');
        }

        // Exchange code for tokens
        const tokenResponse = await axios.post(config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code: code,
                redirect_uri: config.redirectUri
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`
                }
            }
        );

        // Get access token
        const accessToken = tokenResponse.data.access_token;

        // Get user info
        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Store tokens and user info in session
        req.session.accessToken = accessToken;
        req.session.userInfo = userInfo.data;

        // Clear state from session
        delete req.session.state;

        // Save session
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                throw new Error('Failed to save session');
            }
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Error in callback:', error);
        let errorMessage = 'Authentication failed. ';

        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Status code:', error.response.status);
            errorMessage += error.response.data?.message || error.message;
        } else {
            errorMessage += error.message;
        }

        res.redirect('/error?error=' + encodeURIComponent(errorMessage));
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
