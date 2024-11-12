import express from 'express';
import axios from 'axios';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    // Use the official FACEIT redirect endpoint
    redirectUri: 'https://api.faceit.com/account-integration/v1/platforms/partner/redirect',
    authEndpoint: 'https://accounts.faceit.com/oauth/authorize',
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
            redirectUri: config.redirectUri,
            authEndpoint: config.authEndpoint
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
                    'Authorization': getBasicAuthHeader()
                }
            }
        );

        // Store access token in session
        req.session.accessToken = tokenResponse.data.access_token;

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
