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
    },
    debug: (message, data) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] AUTH DEBUG: ${message}`, JSON.stringify(data, null, 2));
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

        // Initialize session if it doesn't exist
        if (!req.session) {
            logger.info('Creating new session');
            req.session = {};
        }

        // Clear any existing state
        delete req.session.state;
        delete req.session.stateTimestamp;

        // Store state in session
        req.session.state = state;
        req.session.stateTimestamp = Date.now();

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

        // Log session details
        logger.debug('Session details:', {
            state: state,
            sessionState: req.session.state,
            sessionId: req.session.id,
            stateTimestamp: req.session.stateTimestamp,
            cookie: req.session.cookie
        });

        // Build authorization URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'openid profile email',
            state: state
        });

        const authUrl = `${config.authEndpoint}?${params.toString()}`;
        logger.debug('Authorization URL:', { url: authUrl });

        // Set security headers
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        logger.info('Redirecting to FACEIT authorization page');
        res.redirect(authUrl);
    } catch (error) {
        logger.error('Error initiating OAuth flow:', error);
        res.redirect('/error?error=' + encodeURIComponent('Failed to initiate authentication'));
    }
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
    try {
        logger.debug('Callback received', {
            url: req.url,
            query: req.query,
            headers: {
                ...req.headers,
                cookie: req.headers.cookie ? '[REDACTED]' : undefined
            },
            method: req.method,
            protocol: req.protocol,
            secure: req.secure,
            hostname: req.hostname,
            originalUrl: req.originalUrl,
            baseUrl: req.baseUrl,
            path: req.path
        });

        const { code, state, error } = req.query;

        // Log detailed callback information
        logger.debug('Callback parameters', {
            hasCode: !!code,
            state,
            error,
            sessionExists: !!req.session,
            sessionState: req.session?.state,
            sessionId: req.session?.id
        });

        // Initialize session if it doesn't exist
        if (!req.session) {
            logger.error('No session object in callback request');
            throw new Error('Session initialization failed');
        }

        // Log session state
        logger.debug('Session state', {
            sessionState: req.session.state,
            stateTimestamp: req.session.stateTimestamp,
            sessionId: req.session.id,
            timeSinceStateSet: req.session.stateTimestamp ? Date.now() - req.session.stateTimestamp : null,
            cookie: req.session.cookie
        });

        // Check for OAuth error response
        if (error) {
            logger.error('OAuth error received:', error);
            throw new Error(`OAuth error: ${error}`);
        }

        // Validate code presence
        if (!code) {
            logger.error('No authorization code received');
            throw new Error('No authorization code received');
        }

        // Validate state
        if (!state) {
            logger.error('No state parameter in callback');
            throw new Error('Missing state parameter');
        }

        if (!req.session.state) {
            logger.error('No state found in session:', {
                sessionData: req.session,
                cookies: req.headers.cookie ? '[REDACTED]' : undefined
            });
            throw new Error('No state in session');
        }

        if (state !== req.session.state) {
            logger.error('State mismatch:', {
                receivedState: state,
                sessionState: req.session.state,
                timeSinceStateSet: req.session.stateTimestamp ? Date.now() - req.session.stateTimestamp : null
            });
            throw new Error('State parameter mismatch');
        }

        logger.info('State validation passed, exchanging code for token');

        // Exchange code for token
        logger.debug('Exchanging code for token', {
            tokenEndpoint: config.tokenEndpoint,
            redirectUri: config.redirectUri,
            codeLength: code.length
        });

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
        );

        logger.info('Token received successfully');
        const accessToken = tokenResponse.data.access_token;

        // Get user info
        logger.debug('Fetching user info');
        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        logger.info('User info received successfully');
        logger.debug('User info', {
            nickname: userInfo.data.nickname,
            email: userInfo.data.email ? '[REDACTED]' : undefined
        });

        // Store in session
        req.session.accessToken = accessToken;
        req.session.userInfo = userInfo.data;
        delete req.session.state;
        delete req.session.stateTimestamp;

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
