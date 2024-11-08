import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import open from 'open';
import { URLSearchParams } from 'url';
import session from 'express-session';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Redis Client
import connectRedis from 'connect-redis';
import { createClient } from 'redis';

const RedisStore = connectRedis(session);
const redisClient = createClient({ legacyMode: true });
redisClient.connect().catch(console.error);

// Configure Session Middleware
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'yoursecret',
  resave: false,
  saveUninitialized: false,
}));

const config = {
    clientId: process.env.FACEIT_CLIENT_ID,
    clientSecret: process.env.FACEIT_CLIENT_SECRET,
    authorizationUrl: 'https://api.faceit.com/auth/v1/oauth/authorize',
    tokenUrl: 'https://api.faceit.com/auth/v1/oauth/token',
    redirectUri: process.env.REDIRECT_URI || `http://localhost:${port}/auth/callback`
};

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('No authorization code received');
    }

    try {
        const tokenResponse = await getAccessToken(code);
        res.send(`Access Token: ${tokenResponse.access_token}`);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed! Please check the console.');
    }
});

async function getAuthorizationCode() {
    return new Promise((resolve, reject) => {
        const authUrl = `${config.authorizationUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${config.redirectUri}&scope=chat.read chat.write`;
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

app.get('/callback', async (req, res) => {
    try {
        console.log('Callback received with query:', req.query);
        const { code, state } = req.query;

        if (!code) {
            console.log('No code provided');
            return res.status(400).send('No code provided');
        }

        // Validate state parameter if implemented
        if (!auth.getAuthState().validate(state)) {
            console.log('Invalid state parameter');
            return res.status(400).send('Invalid state parameter');
        }

        // Exchange code for access token
        const token = await auth.getAccessTokenFromCode(code);

        // Use the access token to retrieve user information
        const userInfoResponse = await axios.get(
            'https://api.faceit.com/auth/v1/resources/userinfo',
            {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                },
            }
        );

        // Store access token and user info in session
        // ... continue your logic
    } catch (error) {
        console.error('Error in /callback:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});