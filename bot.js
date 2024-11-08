// bot.js
import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'redis';
import dotenv from 'dotenv';
import faceitJS from './FaceitJS.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Create Redis client
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false,
    }
});

redisClient.on('error', err => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

await redisClient.connect();

// Configure session middleware with Redis store
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(express.json());

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