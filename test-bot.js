import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import open from 'open';

dotenv.config();

const app = express();
const port = 3000;

// FACEIT OAuth2 Configuration
const config = {
    clientId: process.env.FACEIT_CLIENT_ID,
    clientSecret: process.env.FACEIT_CLIENT_SECRET,
    redirectUri: `http://localhost:${port}/callback`,
    authorizationUrl: 'https://cdn.faceit.com/widgets/sso/index.html',
    tokenUrl: 'https://api.faceit.com/auth/v1/oauth/token'
};

async function getAuthorizationCode() {
    const authUrl = `${config.authorizationUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${config.redirectUri}`;
    
    return new Promise((resolve) => {
        app.get('/callback', async (req, res) => {
            const { code } = req.query;
            res.send('Authentication successful! You can close this window.');
            resolve(code);
            server.close();
        });

        const server = app.listen(port, () => {
            console.log(`\nOpening browser for authentication...`);
            open(authUrl);
        });
    });
}

async function getAccessToken(authCode) {
    try {
        const response = await axios.post(config.tokenUrl, new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri
        }), {
            headers: {
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
        console.log('Authorization code received');

        // Exchange code for access token
        const tokenData = await getAccessToken(authCode);
        console.log('Access token received');

        // Save tokens to .env file
        const envContent = `
FACEIT_ACCESS_TOKEN=${tokenData.access_token}
FACEIT_REFRESH_TOKEN=${tokenData.refresh_token}
TOKEN_EXPIRES_AT=${Date.now() + (tokenData.expires_in * 1000)}
`;

        await fs.promises.appendFile('.env', envContent);
        console.log('Tokens saved to .env file');

        return tokenData;
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

export { authenticate };
