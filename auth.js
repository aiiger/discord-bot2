import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { URLSearchParams } from 'url';

const router = express.Router();

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
    authUrl: 'https://accounts.faceit.com/post-redirect',
    tokenUrl: 'https://api.faceit.com/auth/v1/oauth/token'
};

// Generate PKCE challenge
function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

// Login route
router.get('/auth/faceit', (req, res) => {
    try {
        // Ensure session exists
        if (!req.session) {
            throw new Error('Session not initialized');
        }

        // Generate PKCE values
        const { verifier, challenge } = generatePKCE();

        // Store PKCE verifier in session
        req.session.codeVerifier = verifier;

        // Generate state parameter
        const state = crypto.randomBytes(32).toString('hex');
        req.session.state = state;

        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.redirect('/error?error=session_save_failed');
            }

            console.info('Login initiated - Session ID:', req.sessionID, 'State:', state);
            console.info('Generated authorization URL with PKCE');

            // Construct authorization URL
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                scope: 'openid profile email',
                state: state,
                code_challenge: challenge,
                code_challenge_method: 'S256'
            });

            // Redirect to FACEIT authorization page
            res.redirect(`${config.authUrl}?${params.toString()}`);
        });
    } catch (error) {
        console.error('Error initiating login:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
    }
});

// Callback route
router.get('/callback', async (req, res) => {
    try {
        // Ensure session exists
        if (!req.session) {
            throw new Error('Session not initialized');
        }

        const { code, state } = req.query;

        // Verify state parameter
        if (!state || state !== req.session.state) {
            throw new Error('Invalid state parameter');
        }

        // Get stored code verifier
        const codeVerifier = req.session.codeVerifier;
        if (!codeVerifier) {
            throw new Error('No code verifier found in session');
        }

        // Exchange code for tokens
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: code,
            redirect_uri: config.redirectUri,
            code_verifier: codeVerifier
        });

        const response = await axios.post(config.tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        // Store tokens in session
        req.session.accessToken = response.data.access_token;
        req.session.refreshToken = response.data.refresh_token;

        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.redirect('/error?error=session_save_failed');
            }

            console.info('Successfully exchanged code for tokens');

            // Clear PKCE and state values
            delete req.session.codeVerifier;
            delete req.session.state;

            // Redirect to dashboard
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Error in callback:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
    }
});

// Refresh token route
router.post('/refresh-token', async (req, res) => {
    try {
        // Ensure session exists
        if (!req.session) {
            throw new Error('Session not initialized');
        }

        const refreshToken = req.session.refreshToken;
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: config.clientId,
            client_secret: config.clientSecret
        });

        const response = await axios.post(config.tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        // Update tokens in session
        req.session.accessToken = response.data.access_token;
        req.session.refreshToken = response.data.refresh_token;

        // Save session before sending response
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).json({ error: 'Failed to save session' });
            }

            res.json({ success: true });
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
});

export default router;
