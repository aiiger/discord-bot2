import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// Initialize logger
const logger = {
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] AUTH INFO: ${message}`, ...args);
    },
    error: (message, error) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] AUTH ERROR: ${message}`);
        if (error?.response?.data) {
            console.error('Response data:', error.response.data);
        }
        if (error?.response?.status) {
            console.error('Status code:', error.response.status);
        }
        console.error('Full error:', error);
    }
};

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback',
    authEndpoint: 'https://accounts.faceit.com/auth/v1/oauth/authorize',
    tokenEndpoint: 'https://accounts.faceit.com/auth/v1/oauth/token',
    userInfoEndpoint: 'https://api.faceit.com/auth/v1/resources/userinfo'
};

// Authorization route - initiates OAuth2 flow
router.get('/auth/faceit', async (req, res) => {
    logger.info('Auth route accessed');
    try {
        // Generate state for security
        const state = crypto.randomBytes(16).toString('hex');

        // Log session before modification
        logger.info('Session before state:', req.session);

        req.session.state = state;

        // Force session save
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error('Session save error:', err);
                    reject(err);
                } else {
                    logger.info('Session saved successfully');
                    resolve();
                }
            });
        });

        // Log session after save
        logger.info('Session after save:', {
            state: state,
            sessionState: req.session.state,
            sessionId: req.session.id
        });

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'openid profile email',
            state: state
        });

        const authUrl = `${config.authEndpoint}?${params.toString()}`;

        logger.info('Redirecting to:', authUrl);

        // Set security headers
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.redirect(authUrl);
    } catch (error) {
        logger.error('Error initiating OAuth flow:', error);
        res.redirect('/error?error=' + encodeURIComponent('Failed to initiate authentication'));
    }
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
    try {
        logger.info('Callback received:', {
            hasCode: !!req.query.code,
            state: req.query.state,
            error: req.query.error,
            sessionState: req.session?.state,
            hasSession: !!req.session
        });

        // Detailed session check
        if (!req.session) {
            logger.error('No session found in callback');
            return res.redirect('/error?error=' + encodeURIComponent('No session found'));
        }

        if (!req.query.state) {
            logger.error('No state parameter in callback');
            return res.redirect('/error?error=' + encodeURIComponent('Missing state parameter'));
        }

        if (!req.session.state) {
            logger.error('No state found in session');
            return res.redirect('/error?error=' + encodeURIComponent('No state in session'));
        }

        if (req.query.state !== req.session.state) {
            logger.error('State mismatch:', {
                receivedState: req.query.state,
                sessionState: req.session.state
            });
            return res.redirect('/error?error=' + encodeURIComponent('State mismatch'));
        }

        // Check for authorization code
        if (!req.query.code) {
            logger.error('No authorization code received');
            return res.redirect('/error?error=' + encodeURIComponent('No authorization code received'));
        }

        // Exchange code for tokens
        const tokenResponse = await axios.post(config.tokenEndpoint, {
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: req.query.code,
            redirect_uri: config.redirectUri
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        logger.info('Token received successfully');

        // Get access token
        const accessToken = tokenResponse.data.access_token;

        logger.info('Getting user info');

        // Get user info
        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        logger.info('User info received successfully');

        // Store tokens and user info in session
        req.session.accessToken = accessToken;
        req.session.userInfo = userInfo.data;

        // Clear state from session
        delete req.session.state;

        // Save session
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error('Session save error:', err);
                    reject(err);
                } else {
                    logger.info('Session saved successfully');
                    resolve();
                }
            });
        });

        logger.info('Redirecting to dashboard');
        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Error in callback:', error);
        let errorMessage = 'Authentication failed. ';

        if (error.response) {
            logger.error('Response data:', error.response.data);
            logger.error('Status code:', error.response.status);
            errorMessage += error.response.data?.message || error.message;
        } else {
            errorMessage += error.message;
        }

        res.redirect('/error?error=' + encodeURIComponent(errorMessage));
    }
});

// Logout route
router.get('/logout', (req, res) => {
    logger.info('Logout route accessed');
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session:', err);
        }
        logger.info('Session destroyed, redirecting to home');
        res.redirect('/');
    });
});

export default router;
