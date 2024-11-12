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

// Generate PKCE code verifier and challenge
function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

// Store PKCE and state in session
function storePKCE(req) {
    const pkce = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Initialize oauth object if it doesn't exist
    if (!req.session.oauth) {
        req.session.oauth = {};
    }

    // Store PKCE and state
    req.session.oauth.pkce = pkce;
    req.session.oauth.state = state;

    // Force session save
    return new Promise((resolve, reject) => {
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                reject(err);
            } else {
                resolve({ pkce, state });
            }
        });
    });
}

// Authorization route - initiates OAuth2 flow
router.get('/auth/faceit', async (req, res) => {
    try {
        const { pkce, state } = await storePKCE(req);

        // Build authorization URL with PKCE
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: 'openid profile email',
            state: state,
            code_challenge: pkce.challenge,
            code_challenge_method: 'S256'
        });

        const authUrl = `${config.authEndpoint}?${params.toString()}`;
        res.redirect(authUrl);
    } catch (error) {
        console.error('Error initiating OAuth flow:', error);
        res.redirect('/error?error=' + encodeURIComponent(error.message));
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

        // Check if session exists
        if (!req.session.oauth) {
            throw new Error('Session expired');
        }

        // Verify state parameter
        if (!state || state !== req.session.oauth.state) {
            throw new Error('Invalid state parameter');
        }

        // Exchange code for tokens using PKCE
        const tokenResponse = await axios.post(config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                code: code,
                redirect_uri: config.redirectUri,
                code_verifier: req.session.oauth.pkce.verifier
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Get access token
        const accessToken = tokenResponse.data.access_token;

        // Get user info
        const userInfo = await axios.get(config.userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // Store tokens and user info in session
        req.session.accessToken = accessToken;
        req.session.userInfo = userInfo.data;

        // Clear OAuth data from session
        delete req.session.oauth;

        // Force session save
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                throw new Error('Failed to save session');
            }
            res.redirect('/dashboard');
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
