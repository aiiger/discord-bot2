import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import open from 'open';
import { promises as fs } from 'fs';

dotenv.config();

// FACEIT OAuth2 Configuration
const config = {
    clientId: process.env.FACEIT_CLIENT_ID,
    clientSecret: process.env.FACEIT_CLIENT_SECRET,
    redirectUri: 'https://meslx-13b51d23300b.herokuapp.com/callback',
    authorizationUrl: 'https://accounts.faceit.com',
    tokenUrl: 'https://api.faceit.com/auth/v1/oauth/token',
    scopes: [
        'openid',
        'chat.messages.read',
        'chat.messages.write',
        'chat.rooms.read'
    ].join(' ')
};

async function getAuthorizationCode() {
    const authUrl = `${config.authorizationUrl}/oauth/authorize?` + 
        `client_id=${config.clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `scope=${encodeURIComponent(config.scopes)}`;
    
    return new Promise((resolve) => {
        const app = express();
        const server = app.listen(process.env.PORT || 3001, () => {
            console.log(`\nAuthentication URL: ${authUrl}`);
        });

        app.get('/callback', async (req, res) => {
            const { code } = req.query;
            res.send('Authentication successful! You can close this window.');
            server.close();
            resolve(code);
        });

        // Also handle errors
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
        // Create Basic Auth header
        const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        
        const response = await axios.post(config.tokenUrl, new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: config.redirectUri
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
        // Get authorization code
        const authCode = await getAuthorizationCode();
        if (!authCode) {
            throw new Error('Failed to get authorization code');
        }
        console.log('Authorization code received');

        // Exchange code for access token
        const tokenData = await getAccessToken(authCode);
        console.log('Access token received');

        // In production, we'll use environment variables directly
        if (process.env.NODE_ENV !== 'production') {
            // Save tokens to .env file only in development
            const envContent = `
FACEIT_ACCESS_TOKEN=${tokenData.access_token}
FACEIT_REFRESH_TOKEN=${tokenData.refresh_token}
TOKEN_EXPIRES_AT=${Date.now() + (tokenData.expires_in * 1000)}
`;
            await fs.appendFile('.env', envContent);
            console.log('Tokens saved to .env file');
        }

        return tokenData;
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

export { authenticate };
