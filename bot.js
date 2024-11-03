// bot.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import session from 'express-session';
import Redis from 'ioredis';
import connectRedis from 'connect-redis';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Environment Variables
const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const FACEIT_REDIRECT_URI = 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback';
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;

// Redis configuration
const RedisStore = connectRedis(session);
let redisClient;

if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, {
        tls: {
            rejectUnauthorized: false
        }
    });
} else {
    redisClient = new Redis();
}

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'faceit-bot-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// CORS Configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

// Serve the SDK initialization page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>FACEIT Bot Login</title>
        </head>
        <body>
            <div id="faceitLogin"></div>
            
            <script src="https://cdn.faceit.com/oauth/faceit-oauth-sdk-1.3.0.min.js"></script>
            <script>
                var initParams = {
                    client_id: '${FACEIT_CLIENT_ID}',
                    response_type: 'code',
                    state: '${req.sessionID}',
                    redirect_popup: true,
                    debug: true
                };

                function callback(response) {
                    if(response.isIdTokenValid === true) {
                        console.log('Authentication successful');
                        return;
                    }
                    console.error('ID token validation failed');
                }

                FACEIT.init(initParams, callback);
            </script>
        </body>
        </html>
    `);
});

// Auth endpoint
app.get('/auth', (req, res) => {
    const authUrl = `https://accounts.faceit.com/auth?response_type=code&client_id=${FACEIT_CLIENT_ID}&redirect_popup=true`;
    res.redirect(authUrl);
});

// OAuth2 callback handler
app.get('/callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            throw new Error('Authorization code not received');
        }

        // Exchange code for tokens
        const tokenResponse = await axios.post('https://api.faceit.com/auth/v1/oauth/token', 
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: FACEIT_CLIENT_ID,
                client_secret: FACEIT_CLIENT_SECRET,
                redirect_uri: FACEIT_REDIRECT_URI
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Store tokens in session
        req.session.tokens = {
            access_token: tokenResponse.data.access_token,
            refresh_token: tokenResponse.data.refresh_token,
            id_token: tokenResponse.data.id_token,
            expires_in: Date.now() + (tokenResponse.data.expires_in * 1000)
        };

        // Get user info
        const userInfo = await getUserInfo(tokenResponse.data.access_token);
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authentication Successful</title>
            </head>
            <body>
                <h1>Authentication Successful</h1>
                <p>Welcome ${userInfo.nickname}</p>
                <script>
                    setTimeout(() => {
                        window.close();
                    }, 3000);
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Auth Error:', error);
        res.status(500).send(`Authentication Error: ${error.message}`);
    }
});

// Helper Functions
async function getUserInfo(accessToken) {
    try {
        const response = await axios.get('https://api.faceit.com/auth/v1/resources/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error;
    }
}

async function refreshToken(refreshToken) {
    try {
        const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: FACEIT_CLIENT_ID,
                client_secret: FACEIT_CLIENT_SECRET
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw error;
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;