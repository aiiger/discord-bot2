+import express from 'express';
+import session from 'express-session';
+import RedisStore from 'connect-redis';
+import { createClient } from 'redis';
+import { FaceitJS } from './FaceitJS.js';
+import crypto from 'crypto';
+import dotenv from 'dotenv';
+import logger from './logger.js';
+import { Client, GatewayIntentBits } from 'discord.js';
+
    +dotenv.config();
+
    +// Validate required environment variables
    +const requiredEnvVars = [
        +    'REDIS_URL',
        +    'SESSION_SECRET',
        +    'CLIENT_ID',
        +    'CLIENT_SECRET',
        +    'REDIRECT_URI',
        +    'HUB_ID',
        +    'DISCORD_TOKEN'
        +];
+
    +const patterns = {
+ REDIS_URL: /^rediss:\/\/:[\w-]+@[\w.-]+:\d+$/,
    +    SESSION_SECRET: /^[a-f0-9]{128}$/,
        +    CLIENT_ID: /^[\w-]{36}$/,
            +    CLIENT_SECRET: /^[\w]{40}$/,
                +    REDIRECT_URI: /^https:\/\/[\w.-]+\.herokuapp\.com\/callback$/,
                    +    HUB_ID: /^[\w-]{36}$/
                        +};
+
    +const validators = {
+ REDIS_URL: (url) => patterns.REDIS_URL.test(url),
    +    SESSION_SECRET: (secret) => patterns.SESSION_SECRET.test(secret),
        +    CLIENT_ID: (id) => patterns.CLIENT_ID.test(id),
            +    CLIENT_SECRET: (secret) => patterns.CLIENT_SECRET.test(secret),
                +    REDIRECT_URI: (uri) => patterns.REDIRECT_URI.test(uri),
                    +    HUB_ID: (id) => patterns.HUB_ID.test(id),
                        +    DISCORD_TOKEN: (token) => typeof token === 'string' && token.length > 0
                            +};
+
    +for (const varName of requiredEnvVars) {
        +    const value = process.env[varName];
        +    if (!value) {
            +        logger.error(`Missing required environment variable: ${varName}`);
            +        process.exit(1);
            +    }
        +
            +    if (!validators[varName](value)) {
                +        logger.error(`Invalid format for ${varName}: ${value}`);
                +        logger.error(`Expected format: ${patterns[varName]}`);
                +        process.exit(1);
                +    }
        +}
+
    +logger.info('Environment variables validated successfully');
+
    +// Initialize Express
    +const app = express();
+const port = process.env.PORT || 3000;
+
    +// Initialize Redis client with retry strategy
    +const redisClient = createClient({
+ url: process.env.REDIS_URL,
        +    socket: {
+ tls: true,
        +        rejectUnauthorized: false
    +    },
+    retry_strategy: function(options) {
    +        if (options.error && options.error.code === 'ECONNREFUSED') {
        +            logger.error('Redis connection refused');
        +            return new Error('The server refused the connection');
        +        }
    +        if (options.total_retry_time > 1000 * 60 * 60) {
        +            logger.error('Redis retry time exhausted');
        +            return new Error('Retry time exhausted');
        +        }
    +        if (options.attempt > 10) {
        +            logger.error('Redis maximum retry attempts reached');
        +            return new Error('Maximum retry attempts reached');
        +        }
    +        return Math.min(options.attempt * 100, 3000);
    +    }
+});
+
    +// Redis event handlers
    +redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
+redisClient.on('connect', () => logger.info('Redis Client Connected'));
+redisClient.on('reconnecting', () => logger.info('Redis Client Reconnecting'));
+
    +// Connect to Redis
    +await redisClient.connect().catch(err => {
        +    logger.error('Failed to connect to Redis:', err);
        +    process.exit(1);
        +});
+
    +// Initialize FaceitJS instance
    +const faceitJS = new FaceitJS();
+
    +// Force production mode for Heroku
    +const isProduction = true;
+
    +// Session middleware configuration
    +const sessionMiddleware = session({
+ store: new RedisStore({
+ client: redisClient,
        +        prefix: 'faceit:sess:',
        +        ttl: 86400,
        +        disableTouch: false
    +    }),
+    secret: process.env.SESSION_SECRET,
    +    name: 'faceit_session',
        +    resave: false,
            +    saveUninitialized: false,
                +    cookie: {
    +        secure: isProduction,
        +        httpOnly: true,
            +        maxAge: 24 * 60 * 60 * 1000,
                +        sameSite: 'none',
                    +        domain: isProduction ? '.herokuapp.com' : undefined
                        +    },
+    rolling: true
    +});
+
    +// Apply middleware
    +app.use((req, res, next) => {
        +    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
        +    next();
        +});
+
    +app.use(sessionMiddleware);
+app.use(express.json());
+app.use(express.urlencoded({ extended: true }));
+
    +// Initialize Discord client
    +const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
+
    +// Add login route
    +app.get('/login', (req, res) => {
        +    try {
            +        const state = crypto.randomBytes(32).toString('hex');
            +
                +        // Store state in Redis with short TTL
                +        redisClient.set(`oauth:state:${state}`, 'pending', {
+ EX: 300 // 5 minutes expiry
                +        });
+
    +        req.session.oauthState = state;
+
    +        // Ensure session is saved before redirect
    +        req.session.save((err) => {
        +            if (err) {
            +                logger.error('Failed to save session:', err);
            +                return res.status(500).send('Internal server error');
            +            }
        +
            +            logger.info(`Login initiated - Session ID: ${req.session.id}, State: ${state}`);
        +            const authUrl = faceitJS.getAuthorizationUrl(state);
        +            res.redirect(authUrl);
        +        });
+    } catch (error) {
    +        logger.error('Error in login route:', error);
    +        res.status(500).send('Internal server error');
    +    }
+});
+
    +// Add callback route
    +app.get('/callback', async (req, res) => {
        +    const { code, state } = req.query;
        +    const storedState = req.session.oauthState;
        +
            +    logger.info(`Callback received - Session ID: ${req.session.id}, State: ${state}`);
        +
            +    try {
                +        // Verify state exists in Redis
                    +        const redisState = await redisClient.get(`oauth:state:${state}`);
                +        if (!redisState) {
                    +            logger.error('State not found in Redis');
                    +            return res.status(400).send('Invalid or expired state parameter');
                    +        }
                +
                    +        // Verify state parameter
                    +        if (!state || !storedState || state !== storedState) {
                        +            logger.error(`State mismatch - Session: ${storedState}, Redis: ${redisState}, Received: ${state}`);
                        +            return res.status(400).send('Invalid state parameter');
                        +        }
                +
                    +        // Delete used state from Redis
                    +        await redisClient.del(`oauth:state:${state}`);
                +
                    +        // Exchange the authorization code for tokens
                    +        const response = await faceitJS.oauthInstance.post('/auth/v1/oauth/token', null, {
+ params: {
+ grant_type: 'authorization_code',
                        +                code: code,
                        +                client_id: process.env.CLIENT_ID,
                        +                client_secret: process.env.CLIENT_SECRET,
                        +                redirect_uri: process.env.REDIRECT_URI
                    +            },
        +            headers: {
            +                'Content-Type': 'application/x-www-form-urlencoded'
                +            }
        +        });
+
    +        // Store tokens in session
    +        req.session.accessToken = response.data.access_token;
+        req.session.refreshToken = response.data.refresh_token;
+
    +        // Ensure session is saved before sending response
    +        req.session.save((err) => {
        +            if (err) {
            +                logger.error('Failed to save session with tokens:', err);
            +                return res.status(500).send('Internal server error');
            +            }
        +
            +            // Update FaceitJS instance with the new tokens
            +            faceitJS.accessToken = response.data.access_token;
        +            faceitJS.refreshToken = response.data.refresh_token;
        +
            +            logger.info('Successfully authenticated with FACEIT');
        +            res.send('Authentication successful! You can close this window.');
        +        });
+    } catch (error) {
    +        logger.error('Error during OAuth callback:', error);
    +        res.status(500).send('Authentication failed');
    +    }
+});
+
    +// Handle match state changes
    +faceitJS.onMatchStateChange(async (match) => {
        +    try {
            +        logger.info(`Match ${match.id} state changed to ${match.state}`);
            +
                +        // Get match details including chat room info
                +        const matchDetails = await faceitJS.getMatchDetails(match.id);
            +        const roomDetails = await faceitJS.getRoomDetails(match.id);
            +
                +        // Get recent messages
                +        const messages = await faceitJS.getRoomMessages(match.id, '', 10);
            +
                +        logger.info(`Match ${match.id} details:`, {
+ state: match.state,
                    +            room: roomDetails,
                    +            messageCount: messages.length
                +        });
+
    +        // Send notification to match room based on state
    +        let notification = '';
+        switch (match.state) {
+            case 'READY':
+                notification = 'Match is ready! Please join the server.';
+                break;
+            case 'ONGOING':
+                notification = 'Match has started! Good luck and have fun!';
+                break;
+            case 'FINISHED':
+                notification = 'Match has ended. Thanks for playing!';
+                break;
+            case 'CANCELLED':
+                notification = 'Match has been cancelled.';
+                break;
+        }
+
    +        if (notification) {
        +            await faceitJS.sendRoomMessage(match.id, notification);
        +        }
+    } catch (error) {
    +        logger.error('Error handling match state change:', error);
    +    }
+});
+
    +// Handle chat commands
    +client.on('messageCreate', async (message) => {
        +    if (message.author.bot) return;
        +
            +    const command = message.content.toLowerCase();
        +
            +    try {
                +        if (command === '!cancel') {
                    +            // Get the active match from the hub
                        +            const matches = await faceitJS.getHubMatches(process.env.HUB_ID, 'ongoing');
                    +            const activeMatch = matches[0]; // Get the most recent ongoing match
                    +
                        +            if (activeMatch) {
                            +                // Get match details before cancelling
                                +                const matchDetails = await faceitJS.getMatchDetails(activeMatch.match_id);
                            +
                                +                // Cancel the match
                                +                await faceitJS.cancelMatch(activeMatch.match_id);
                            +
                                +                // Send notification to Discord
                                +                message.reply(`Match ${activeMatch.match_id} cancelled successfully.`);
                            +
                                +                // Send notification to match room
                                +                await faceitJS.sendRoomMessage(activeMatch.match_id,
                                    +                    `Match has been cancelled by admin (${message.author.username}).`
                                    +                );
                            +
                                +                logger.info(`Match ${activeMatch.match_id} cancelled by ${message.author.username}`, {
+ matchDetails
                                    +                });
+            } else {
    +                message.reply('No active matches found in the hub.');
    +            }
+        } else if (command === '!rehost') {
    +            const matches = await faceitJS.getHubMatches(process.env.HUB_ID, 'ongoing');
    +            const activeMatch = matches[0];
    +
        +            if (activeMatch) {
            +                // Get match details before rehosting
                +                const matchDetails = await faceitJS.getMatchDetails(activeMatch.match_id);
            +
                +                // Rehost the match
                +                await faceitJS.rehostMatch(activeMatch.match_id);
            +
                +                // Send notification to Discord
                +                message.reply(`Match ${activeMatch.match_id} rehosted successfully.`);
            +
                +                // Send notification to match room
                +                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    +                    `Match has been rehosted by admin (${message.author.username}).`
                    +                );
            +
                +                logger.info(`Match ${activeMatch.match_id} rehosted by ${message.author.username}`, {
+ matchDetails
                    +                });
    +            } else {
    +                message.reply('No active matches found in the hub.');
    +            }
+        }
+    } catch (error) {
    +        logger.error('Error handling command:', error);
    +        message.reply('An error occurred while processing the command.');
    +    }
+});
+
    +// Error handling
    +client.on('error', (error) => {
        +    logger.error('Discord client error:', error);
        +});
+
    +// Handle unhandled promise rejections
    +process.on('unhandledRejection', (error) => {
        +    logger.error('Unhandled promise rejection:', error);
        +});
+
    +// Handle uncaught exceptions
    +process.on('uncaughtException', (error) => {
        +    logger.error('Uncaught exception:', error);
        +});
+
    +// Login to Discord
    +client.login(process.env.DISCORD_TOKEN).catch(error => {
        +    logger.error('Failed to login to Discord:', error);
        +});
+
    +// Start server
    +app.listen(port, () => {
        +    logger.info(`Server running on port ${port}`);
        +});
+
    +export default app;
