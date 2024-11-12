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
        const { code, state, error } = req.query;

        logger.info('Callback received:', {
            hasCode: !!code,
            state,
            error,
            sessionState: req.session?.state,
            hasSession: !!req.session,
            sessionId: req.session?.id,
            cookies: req.headers.cookie
        });

        // Check for OAuth error response
        if (error) {
            logger.error('OAuth error received:', error);
            throw new Error(`OAuth error: ${error}`);
        }

        // Detailed session validation
        if (!req.session) {
            logger.error('No session found in callback');
            throw new Error('No session found');
        }

        if (!state) {
            logger.error('No state parameter in callback');
            throw new Error('Missing state parameter');
        }

        if (!req.session.state) {
            logger.error('No state found in session:', {
                sessionData: req.session,
                cookies: req.headers.cookie
            });
            throw new Error('No state in session');
        }

        if (state !== req.session.state) {
            logger.error('State mismatch:', {
                receivedState: state,
                sessionState: req.session.state,
                sessionId: req.session.id
            });
            throw new Error('Invalid state parameter');
        }

        logger.info('State validation passed, exchanging code for token');

        // Exchange code for token
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
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        ).catch(error => {
            logger.error('Token exchange failed:', {
                status: error.response?.status,
                data: error.response?.data,
                config: {
                    url: error.config?.url,
                    headers: error.config?.headers,
                    data: error.config?.data
                }
            });
            throw error;
        });

        logger.info('Token received successfully');

        const accessToken = tokenResponse.data.access_token;

        // Get user info
        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }).catch(error => {
            logger.error('User info request failed:', {
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        });

        logger.info('User info received successfully');

        // Store in session
        req.session.accessToken = accessToken;
        req.session.userInfo = userInfo.data;
        delete req.session.state;

        // Save session
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    logger.error('Session save error:', err);
                    reject(err);
                } else {
                    logger.info('Session saved with tokens');
                    resolve();
                }
            });
        });

        logger.info('Authentication successful, redirecting to dashboard');
        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Error in callback:', error);
        const errorMessage = 'Authentication failed. ' + (error.message || 'Unknown error');
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
