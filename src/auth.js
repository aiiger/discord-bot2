const express = require('express');
const crypto = require('crypto');
const { FaceitJS } = require('../FaceitJS.js');

const router = express.Router();
const faceitJS = new FaceitJS();

router.get('/auth/faceit', async (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString('hex');
        const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state);

        console.log(`[AUTH] Generated state: ${state}`);
        console.log(`[AUTH] Session ID: ${req.session.id}`);
        console.log(`[AUTH] Code verifier length: ${codeVerifier.length}`);
        console.log('[AUTH] Cookies:', JSON.stringify(req.cookies, null, 2));

        // Store state and code verifier in session
        req.session.oauthState = state;
        req.session.codeVerifier = codeVerifier;

        // Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                console.error('[AUTH] Failed to save session:', err);
                return res.status(500).render('error', {
                    message: 'Internal Server Error',
                    error: 'Failed to save session'
                });
            }

            console.log('[AUTH] Session saved successfully');
            console.log('[AUTH] Redirecting to:', url);
            res.redirect(url);
        });
    } catch (error) {
        console.error('[AUTH] Error in auth route:', error);
        res.status(500).render('error', {
            message: 'Internal Server Error',
            error: error.message
        });
    }
});

router.get('/auth/callback', async (req, res) => {
    console.log('[CALLBACK] Received callback request');
    console.log('[CALLBACK] Session ID:', req.session.id);
    console.log('[CALLBACK] Query params:', req.query);
    console.log('[CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[CALLBACK] Cookies:', JSON.stringify(req.cookies, null, 2));

    const { code, state } = req.query;

    try {
        console.log('[CALLBACK] Stored state:', req.session.oauthState);
        console.log('[CALLBACK] Received state:', state);

        // Verify state parameter
        if (!state || state !== req.session.oauthState) {
            console.error('[CALLBACK] State mismatch');
            console.error('[CALLBACK] Session state:', req.session.oauthState);
            console.error('[CALLBACK] Received state:', state);
            return res.status(400).render('error', {
                message: 'Invalid State',
                error: 'State parameter mismatch. Please try logging in again.'
            });
        }

        console.log('[CALLBACK] State verified successfully');
        console.log('[CALLBACK] Code verifier:', req.session.codeVerifier);

        // Exchange the authorization code for tokens
        const tokens = await faceitJS.exchangeCodeForToken(code, req.session.codeVerifier);

        console.log('[CALLBACK] Token exchange successful');

        // Store tokens in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;

        // Set the access token in FaceitJS instance
        req.app.locals.faceitJS.setAccessToken(tokens.access_token);

        // Get user info
        const userInfo = await req.app.locals.faceitJS.getUserInfo();
        req.session.userInfo = userInfo;

        // Start match state polling after successful authentication
        if (!req.app.locals.faceitJS.pollingInterval) {
            req.app.locals.faceitJS.startPolling();
            console.log('[CALLBACK] Started FACEIT match state polling');
        }

        // Ensure session is saved before sending response
        req.session.save((err) => {
            if (err) {
                console.error('[CALLBACK] Failed to save session with tokens:', err);
                return res.status(500).render('error', {
                    message: 'Internal Server Error',
                    error: 'Failed to save session'
                });
            }

            console.log('[CALLBACK] Session saved successfully');
            console.log('[CALLBACK] Redirecting to dashboard');
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('[CALLBACK] Error during OAuth callback:', error.message);
        console.error('[CALLBACK] Full error:', error);
        res.status(500).render('error', {
            message: 'Authentication Failed',
            error: error.message
        });
    }
});

module.exports = router;
