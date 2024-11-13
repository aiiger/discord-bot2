// auth.js
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// Enhanced logger
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
        if (error?.stack) {
            console.error('Stack trace:', error.stack);
        }
    },
    debug: (message, data) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] AUTH DEBUG: ${message}`, JSON.stringify(data, null, 2));
    }
};

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.FACEIT_CLIENT_ID,
    clientSecret: process.env.FACEIT_CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3002/callback',
    authEndpoint: 'https://accounts.faceit.com/auth/v1/oauth/authorize',
    tokenEndpoint: 'https://api.faceit.com/auth/v1/oauth/token',
    userInfoEndpoint: 'https://api.faceit.com/auth/v1/resources/userinfo',
    scope: 'openid profile email membership chat.messages.read chat.messages.send matches.read'
};

// PKCE code verifier generation
function generateCodeVerifier() {
    const verifier = crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    return verifier.substring(0, 128);
}

// PKCE code challenge generation
async function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    return hash;
}

// Helper function to validate session
function validateSession(req) {
    if (!req.session) {
        throw new Error('No session found');
    }
    if (!req.session.codeVerifier) {
        throw new Error('No code verifier found in session');
    }
    return true;
}

// Helper function to save session
function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((err) => {
            if (err) {
                logger.error('Failed to save session', err);
                reject(err);
            }
            resolve();
        });
    });
}

// Authorization route
router.get('/auth/faceit', async (req, res) => {
    try {
        logger.info('Starting OAuth2 authorization flow');

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = crypto.randomBytes(32).toString('hex');

        if (!req.session) {
            req.session = {};
        }

        req.session.codeVerifier = codeVerifier;
        req.session.state = state;
        req.session.stateTimestamp = Date.now();

        logger.debug('Session before save', {
            hasCodeVerifier: !!req.session.codeVerifier,
            hasState: !!req.session.state,
            sessionID: req.sessionID
        });

        await saveSession(req);

        logger.debug('Session after save', {
            hasCodeVerifier: !!req.session.codeVerifier,
            hasState: !!req.session.state,
            sessionID: req.sessionID
        });

        const authParams = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scope,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const authUrl = `${config.authEndpoint}?${authParams.toString()}`;

        logger.debug('Authorization parameters', {
            state,
            redirectUri: config.redirectUri,
            hasCodeChallenge: !!codeChallenge
        });

        res.redirect(authUrl);
    } catch (error) {
        logger.error('Authorization initialization failed', error);
        res.redirect('/error?message=auth_failed');
    }
});

// Callback route
router.get('/callback', async (req, res) => {
    try {
        logger.info('Processing OAuth callback');
        logger.debug('Session state at callback', {
            hasCodeVerifier: !!req.session?.codeVerifier,
            hasState: !!req.session?.state,
            sessionID: req.sessionID
        });

        const { code, state, error } = req.query;

        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        validateSession(req);
        if (state !== req.session.state) {
            throw new Error('State mismatch');
        }

        const tokenResponse = await axios.post(config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                code: code,
                redirect_uri: config.redirectUri,
                code_verifier: req.session.codeVerifier
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
                }
            }
        );

        const { access_token, refresh_token } = tokenResponse.data;

        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        req.session.accessToken = access_token;
        req.session.refreshToken = refresh_token;
        req.session.userInfo = userInfo.data;

        delete req.session.codeVerifier;
        delete req.session.state;
        delete req.session.stateTimestamp;

        await saveSession(req);

        if (req.app.locals.faceitJS) {
            req.app.locals.faceitJS.setAccessToken(access_token);
        }

        logger.info('Authentication successful');
        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Callback processing failed', error);
        res.redirect('/error?message=callback_failed');
    }
});

// Token refresh route
router.post('/refresh-token', async (req, res) => {
    try {
        if (!req.session?.refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await axios.post(config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: req.session.refreshToken,
                client_id: config.clientId
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
                }
            }
        );

        const { access_token, refresh_token } = response.data;

        req.session.accessToken = access_token;
        req.session.refreshToken = refresh_token;

        await saveSession(req);

        if (req.app.locals.faceitJS) {
            req.app.locals.faceitJS.setAccessToken(access_token);
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Token refresh failed', error);
        res.status(401).json({ error: 'Token refresh failed' });
    }
});

export default router;
