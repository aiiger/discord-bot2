// bot.cjs

// ***** IMPORTS ***** //
const connectRedis = require('connect-redis');
const Redis = require('ioredis');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { cleanEnv, str, url: envUrl, port } = require('envalid');
const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const FaceitJS = require('./FaceitJS');
const { getAuthorizationUrl, getAccessTokenFromCode, getUserInfo } = FaceitJS;
const logger = require('./logger');

// ***** ENVIRONMENT VARIABLES ***** //
dotenv.config();

// Custom validator for NODE_ENV
const env = cleanEnv(process.env, {
    FACEIT_CLIENT_ID: str(),
    FACEIT_CLIENT_SECRET: str(),
    REDIRECT_URI: envUrl(),
    FACEIT_API_KEY_SERVER: str(),
    FACEIT_API_KEY_CLIENT: str(),
    SESSION_SECRET: str(),
    REDIS_URL: envUrl(),
    NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
    PORT: port(),
});

// Initialize Express app
const app = express();
app.set('trust proxy', 1); // Trust the first proxy

// ***** SECURITY MIDDLEWARE ***** //
app.use(helmet());

// ***** CONTENT SECURITY POLICY ***** //
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://api.faceit.com'],
            styleSrc: ["'self'", 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'https://api.faceit.com'],
            connectSrc: ["'self'", 'https://api.faceit.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    })
);

// ***** RATE LIMITING ***** //
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// ***** LOGGER ***** //
// Use morgan for HTTP request logging, integrated with Winston
app.use(
    morgan('combined', {
        stream: {
            write: (message) => {
                logger.info(message.trim());
            },
        },
    })
);

// ***** SESSION CONFIGURATION ***** //
const RedisStore = connectRedis(session);
const redisClient = new Redis(env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false, // Accept self-signed certificates
    },
}); // Create Redis client instance
const sessionStore = new RedisStore({ client: redisClient }); // Pass Redis client to RedisStore

app.use(
    session({
        store: sessionStore,
        secret: env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: env.NODE_ENV === 'production', // Ensure HTTPS in production
            httpOnly: true,
            sameSite: 'lax', // Adjust based on your requirements
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
        name: 'faceit.sid',
    })
);

// ***** MIDDLEWARE TO PARSE JSON ***** //
app.use(express.json());

// Root Endpoint - Show login page
app.get('/', (req, res) => {
    if (req.session.accessToken) {
        res.redirect('/dashboard');
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>FACEIT Bot</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        text-align: center;
                    }
                    h1 {
                        color: #FF5500;
                    }
                    .login-button {
                        display: inline-block;
                        padding: 10px 20px;
                        background-color: #FF5500;
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>FACEIT Bot</h1>
                <p>Please log in with your FACEIT account to continue.</p>
                <a href="/auth" class="login-button">Login with FACEIT</a>
            </body>
            </html>
        `);
    }
});

// Auth Endpoint
app.get('/auth', async (req, res) => {
    try {
        const state = Math.random().toString(36).substring(2, 15);
        req.session.authState = state; // Store state in session
        const authUrl = getAuthorizationUrl(state);
        logger.info(`Redirecting to FACEIT auth URL: ${authUrl}`);
        res.redirect(authUrl);
    } catch (error) {
        logger.error(`Error generating auth URL: ${error.message}`);
        res.status(500).send('Authentication initialization failed.');
    }
});

// OAuth2 Callback Endpoint
app.get('/callback', async (req, res) => {
    try {
        logger.info(`Callback received with query: ${JSON.stringify(req.query)}`);
        const { code, state } = req.query;

        if (!code) {
            logger.warn('No code provided - redirecting to login');
            return res.redirect('/?error=no_code');
        }

        // Validate state parameter
        if (state !== req.session.authState) {
            logger.warn('Invalid state parameter - possible CSRF attack');
            return res.redirect('/?error=invalid_state');
        }
        delete req.session.authState; // Clean up

        // Exchange code for access token
        const token = await getAccessTokenFromCode(code);
        logger.info(`Access token obtained: ${token.access_token}`);

        // Use the access token to retrieve user information
        const userInfo = await getUserInfo(token.access_token);
        logger.info(`User info retrieved: ${userInfo.nickname}`);

        // Store access token and user info in session
        req.session.accessToken = token.access_token;
        req.session.user = userInfo;

        // Optionally store refresh token if provided
        if (token.refresh_token) {
            req.session.refreshToken = token.refresh_token;
            logger.info('Refresh token stored in session');
        }

        res.redirect('/dashboard');
    } catch (error) {
        logger.error(`Error during OAuth callback: ${error.message}`);
        res.redirect('/?error=auth_failed');
    }
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/');
    }
    res.send(`
        <h1>Welcome, ${req.session.user.nickname}!</h1>
        <p>You are now authenticated with FACEIT.</p>
        <h2>Available Commands:</h2>
        <ul>
            <li><strong>Get Hub:</strong> GET /api/hubs/:hubId</li>
            <li><strong>Rehost:</strong> POST /api/championships/rehost</li>
            <li><strong>Cancel:</strong> POST /api/championships/cancel</li>
        </ul>
        <p><a href="/logout" style="color: #FF5500;">Logout</a></p>
    `);
});

// API Routes
const apiRouter = express.Router();
app.use('/api', apiRouter);

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.accessToken) {
        next();
    } else {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in first',
        });
    }
};

// Apply authentication middleware to all API routes
apiRouter.use(isAuthenticated);

// Hub Routes
apiRouter.get('/hubs/:hubId', async (req, res) => {
    try {
        const { hubId } = req.params;
        const response = await FaceitJS.getHubsById(hubId);
        res.json(response);
    } catch (error) {
        logger.error(`Error getting hub: ${error.message}`);
        res.status(500).json({
            error: 'Hub Error',
            message: 'Failed to get hub information',
        });
    }
});

// Championship Routes
apiRouter.post('/championships/rehost', async (req, res) => {
    try {
        const { gameId, eventId } = req.body;

        if (!gameId || !eventId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing gameId or eventId',
            });
        }

        const response = await FaceitJS.rehostChampionship(eventId, gameId);
        res.json({
            message: `Rehosted event ${eventId} for game ${gameId}`,
            data: response,
        });
    } catch (error) {
        logger.error(`Error rehosting championship: ${error.message}`);
        res.status(500).json({
            error: 'Rehost Error',
            message: 'Failed to rehost championship',
        });
    }
});

apiRouter.post('/championships/cancel', async (req, res) => {
    try {
        const { eventId } = req.body;

        if (!eventId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing eventId',
            });
        }

        const response = await FaceitJS.cancelChampionship(eventId);
        res.json({
            message: `Canceled event ${eventId}`,
            data: response,
        });
    } catch (error) {
        logger.error(`Error canceling championship: ${error.message}`);
        res.status(500).json({
            error: 'Cancel Error',
            message: 'Failed to cancel championship',
        });
    }
});

// Health check endpoint for Heroku
app.get('/health', (_, res) => {
    res.status(200).json({ status: 'OK' });
});

// Logout Route
app.get('/logout', async (req, res) => {
    logger.info('Logging out');
    req.session.destroy((err) => {
        if (err) {
            logger.error(`Error destroying session: ${err.message}`);
            return res.status(500).send('Failed to logout.');
        }
        res.clearCookie('faceit.sid');
        res.redirect('/?message=logged_out');
    });
});

// Start the server
const PORT = env.PORT || 3000;
const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Redirect URI: ${env.REDIRECT_URI}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        // Close Redis connection if in production
        if (env.NODE_ENV === 'production' && sessionStore.client) {
            sessionStore.client.quit(() => {
                logger.info('Redis client disconnected');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});

// Catch-all route for undefined paths
app.use((_req, res) => {
    res.status(404).send('Not Found');
});