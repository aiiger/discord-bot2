import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import open from 'open';
import { URLSearchParams } from 'url';
import { config, getAccessToken } from './auth.js';


dotenv.config();

const app = express();
const port = process.env.PORT || 3001; // Change to a different port if needed

// Add middleware for parsing JSON
app.use(express.json());
app.use(express.static('public'));

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Store user tokens
let userTokens = {
    access_token: null,
    refresh_token: null,
    expires_at: null
};

// Example route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// OAuth callback route
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('No authorization code received');
    }

    try {
        const tokenResponse = await auth.getAccessToken(code);
        userTokens = tokenResponse;
        res.send(`Access Token: ${tokenResponse.access_token}`);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed! Please check the console.');
    }
});

async function getAuthorizationCode() {
    return new Promise((resolve, reject) => {
        const authUrl = `${auth.config.authorizationUrl}?response_type=code&client_id=${auth.config.clientId}&redirect_uri=${auth.config.redirectUri}&scope=chat.read chat.write`;
        open(authUrl);

        const server = app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}/`);
        });

        app.get('/auth/callback', (req, res) => {
            const { code } = req.query;
            if (code) {
                res.send('Authorization code received. You can close this window.');
                server.close();
                resolve(code);
            } else {
                res.status(400).send('No authorization code received');
                server.close();
                resolve(null);
            }
        });

        app.use((err, req, res, next) => {
            console.error('Error in callback:', err);
            res.status(500).send('Authentication failed! Please check the console.');
            server.close();
            resolve(null);
        });
    });
}

async function getAccessToken(authCode) {
    try {
        const basicAuth = Buffer.from(`${auth.config.clientId}:${auth.config.clientSecret}`).toString('base64');
        const response = await axios.post(auth.config.tokenUrl, new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: auth.config.redirectUri
        }), {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;
    }
}

async function authenticate() {
    console.log('Starting authentication process...');
    try {
        const authCode = await getAuthorizationCode();
        if (!authCode) {
            throw new Error('Failed to get authorization code');
        }
        console.log('Authorization code received');
        const tokenResponse = await getAccessToken(authCode);
        console.log('Access token received:', tokenResponse.access_token);
    } catch (error) {
        console.error('Authentication failed:', error);
    }
}

authenticate();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});