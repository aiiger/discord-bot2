import dotenv from 'dotenv';
import express from 'express';
import auth from './auth';

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

// Environment variables
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const WEBHOOK_SECRET = 'faceit-webhook-secret-123';
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const WEBHOOK_SECRET = 'faceit-webhook-secret-123';

// Store user tokens
let userTokens = {
    access_token: null,
    refresh_token: null,
    expires_at: null
};
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});