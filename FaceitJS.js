const axios = require('axios');
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const FaceitJS = require('./FaceitJS'); // Ensure this path is correct

const app = express();
const port = process.env.PORT || 3000;

// Session middleware configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(express.json());

const faceitJS = new FaceitJS();

class FaceitJS {
    constructor() {
        this.clientId = 'y30bdac0f-591c-408d-88c3-bebb897339b9'; // Replace with your actual client ID
        this.clientSecret = 'BiiHeq7uTxAVWD60y6EtWXpAONTiosJjtPqO8Va8'; // Replace with your actual client secret
        this.redirectUri = 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback'; // Replace with your actual redirect URI
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
        this.authorizationEndpoint = 'https://accounts.faceit.com';
        this.userinfoEndpoint = 'https://api.faceit.com/auth/v1/resources/userinfo';
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state: state,
            scope: 'openid profile email membership',
        });

        return `${this.authorizationEndpoint}?${params.toString()}`;
    }

    async getAccessTokenFromCode(code) {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios.post(this.tokenEndpoint, 
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri,
                }), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${credentials}`,
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    async getUserInfo(accessToken) {
        try {
            const response = await axios.get(this.userinfoEndpoint, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            return response.data;
        } catch (error) {
            console.error('User info error:', error.response?.data || error.message);
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }
}

// Root route
app.get('/', (req, res) => {
    res.send('<a href="/auth">Login with FACEIT</a>');
});

// Authentication route
app.get('/auth', (req, res) => {
    try {
        const state = crypto.randomBytes(16).toString('hex');
        req.session.state = state;
        console.log('Generated state:', state);
        const authorizationUrl = faceitJS.getAuthorizationUrl(state);
        console.log('Auth URL:', authorizationUrl);
        res.redirect(authorizationUrl);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Authentication failed');
    }
});

// Callback route
app.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        console.log('Received state:', state);
        console.log('Session state:', req.session.state);

        if (!state || !req.session.state || state !== req.session.state) {
            console.error('State mismatch', { 
                receivedState: state, 
                sessionState: req.session.state 
            });
            return res.status(400).send('Invalid state parameter');
        }

        delete req.session.state;

        const tokenData = await faceitJS.getAccessTokenFromCode(code);
        req.session.accessToken = tokenData.access_token;
        req.session.refreshToken = tokenData.refresh_token;
        
        await req.session.save();
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Error exchanging authorization code for tokens');
    }
});

// Protected route
app.get('/dashboard', async (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }

    try {
        const userInfo = await faceitJS.getUserInfo(req.session.accessToken);
        res.json(userInfo);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error fetching user info');
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;