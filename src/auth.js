// auth.js
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { generateCodeVerifier } = require('./crypto');

dotenv.config();

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
    }
};

// FACEIT OAuth2 configuration
const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI
};

// Helper function to save token to file
function saveTokenToFile(token) {
    try {
        const tokenPath = path.join(__dirname, 'token.json');
        fs.writeFileSync(tokenPath, JSON.stringify({ accessToken: token }), 'utf8');
        logger.info('Token saved to file');
    } catch (error) {
        logger.error('Failed to save token to file', error);
    }
}

// Authorization route
router.get('/auth/faceit', async (req, res) => {
    try {
        logger.info('Starting OAuth2 authorization flow');

        // Generate code verifier
        const codeVerifier = generateCodeVerifier();
        req.session.codeVerifier = codeVerifier;

        // Exactly match the example code's URL parameters
        const authParams = new URLSearchParams({
            client_id: config.clientId,
            response_type: 'code',
            code_challenge: codeVerifier,
            code_challenge_method: 'plain',
            redirect_popup: 'true',
            redirect_uri: config.redirectUri
        });

        // Use the exact URL format from the example with /oauth/authorize path
        const authUrl = `https://accounts.faceit.com/oauth/authorize?${authParams.toString()}`;
        logger.info('Redirecting to auth URL:', authUrl);
        res.redirect(authUrl);
    } catch (error) {
        logger.error('Authorization initialization failed', error);
        res.redirect('/error?message=' + encodeURIComponent('Failed to start authorization. Please try again.'));
    }
});

// Callback route
router.get('/callback', async (req, res) => {
    try {
        logger.info('Processing OAuth callback');
        const { code, error } = req.query;

        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
            throw new Error('No code received');
        }

        logger.info('Exchanging code for access token');
        const tokenResponse = await axios.post('https://api.faceit.com/auth/v1/oauth/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                code: code,
                code_verifier: req.session.codeVerifier,
                redirect_uri: config.redirectUri
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
                }
            }
        );

        const { access_token, refresh_token } = tokenResponse.data;
        logger.info('Successfully obtained access token');

        logger.info('Fetching user info');
        const userInfo = await axios.get('https://api.faceit.com/auth/v1/resources/userinfo', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        req.session.accessToken = access_token;
        req.session.refreshToken = refresh_token;
        req.session.userInfo = userInfo.data;

        // Save token to file
        saveTokenToFile(access_token);

        // Set the access token in the shared FaceitJS instance
        if (req.app.locals.faceitJS) {
            logger.info('Setting access token in FaceitJS instance');
            req.app.locals.faceitJS.setAccessToken(access_token);
        }

        logger.info('Authentication successful, redirecting to dashboard');
        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Callback processing failed', error);
        res.redirect('/error?message=' + encodeURIComponent('Authentication failed. Please try again.'));
    }
});

// Logout route
router.get('/logout', (req, res) => {
    logger.info('Processing logout request');

    if (req.app.locals.faceitJS) {
        logger.info('Clearing access token from FaceitJS instance');
        req.app.locals.faceitJS.setAccessToken(null);
    }

    try {
        fs.unlinkSync(path.join(__dirname, 'token.json'));
        logger.info('Token file removed');
    } catch (error) {
        logger.error('Error removing token file', error);
    }

    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session', err);
        }
        logger.info('Session destroyed, redirecting to home');
        res.redirect('/');
    });
});

module.exports = router;
