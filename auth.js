import express from 'express';
import axios from 'axios';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback',
    tokenEndpoint: 'https://api.faceit.com/auth/v1/oauth/token'
};

// Create Basic Auth header for client authentication
const getBasicAuthHeader = () => {
    const credentials = `${config.clientId}:${config.clientSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
};

// Login route - renders the login page
router.get('/auth/faceit', (req, res) => {
    try {
        console.info('[' + new Date().toISOString() + '] INFO: GET /auth/faceit - IP:', req.ip);
        res.render('login', {
            clientId: config.clientId,
            redirectUri: config.redirectUri
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
    }
});

// Handle OAuth callback
router.post('/callback', async (req, res) => {
    try {
        console.info('Received callback with body:', JSON.stringify(req.body));
        const { code, code_verifier } = req.body;

        if (!code || !code_verifier) {
            throw new Error('Missing required parameters');
        }

        // Exchange authorization code for tokens
        const tokenResponse = await axios.post(config.tokenEndpoint,
            {
                grant_type: 'authorization_code',
                code: code,
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                code_verifier: code_verifier
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': getBasicAuthHeader()
                }
            }
        );

        // Store access token in session
        req.session.accessToken = tokenResponse.data.access_token;

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
        if (error.response) {
            console.error('Error response:', error.response.data);
        }
        res.status(401).json({ error: error.message });
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

        // Render the login page with the authorization code
        // The frontend JavaScript will handle exchanging it for tokens
        res.render('login', {
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            code: code,
            state: state
        });
    } catch (error) {
        console.error('Error in callback:', error);
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
