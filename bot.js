// ***** IMPORTS ***** //
import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis'; // Correct import statement
import Redis from 'redis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { cleanEnv, str, url as envUrl, port } from 'envalid';
import FaceitJS from './FaceitJS.js'; // Ensure this path is correct
import logger from './logger.js'; // Ensure this path is correct

// Load environment variables from .env file
dotenv.config();

// ***** ENVIRONMENT VARIABLES ***** //
const env = cleanEnv(process.env, {
    FACEIT_CLIENT_ID: str(),
    FACEIT_CLIENT_SECRET: str(),
    REDIRECT_URI: envUrl(),
    FACEIT_API_KEY_SERVER: str(),
    FACEIT_API_KEY_CLIENT: str(),
    SESSION_SECRET: str(),
    REDIS_URL: envUrl(),
    NODE_ENV: str({ choices: ["development", "production", "test"] }),
    PORT: port(),
});

// Initialize Express app
const app = express();
app.set("trust proxy", 1); // Trust the first proxy

// Set the view engine to EJS and views directory
app.set("view engine", "ejs");
app.set("views", "./views");

// ***** SECURITY MIDDLEWARE ***** //
app.use(helmet());

// ***** CONTENT SECURITY POLICY ***** //
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://api.faceit.com"],
            styleSrc: ["'self'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https://api.faceit.com"],
            connectSrc: ["'self'", "https://api.faceit.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
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
    message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// ***** LOGGER ***** //
app.use(
    morgan("combined", {
        stream: {
            write: (message) => {
                logger.info(message.trim());
            },
        },
    })
);

// Create a Redis client
const redisClient = Redis.createClient({
    url: env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false, // Accept self-signed certificates if needed
    },
});

// Handle Redis connection errors
redisClient.on("error", (err) => {
    logger.error("Redis Client Error:", err);
});
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).send('Something broke!');
});
// Initialize RedisStore
const store = new RedisStore({ client: redisClient }); // Use new with RedisStore

// Configure session middleware
app.use(
    session({
        store: store,
        secret: env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: env.NODE_ENV === 'production', // Ensure HTTPS in production
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
        name: 'sessionId',
    })
);

// ***** MIDDLEWARE TO PARSE JSON ***** //
app.use(express.json());

// Root Endpoint - Show login page
// Example of enhanced error handling for your routes
app.get("/", (req, res) => {
    try {
        if (req.session.accessToken) {
            res.redirect("/dashboard");
        } else {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>FACEIT Bot</title>
                </head>
                <body>
                    <h1>FACEIT Bot</h1>
                    <p>Please log in with your FACEIT account to continue.</p>
                    <a href="/auth">Login with FACEIT</a>
                </body>
                </html>
            `);
        }
    } catch (error) {
        logger.error(`Error in root route: ${error.message}`);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/auth", async (req, res) => {
    try {
        const state = Math.random().toString(36).substring(2, 15);
        req.session.authState = state; // Store state in session
        const authUrl = FaceitJS.getAuthorizationUrl(state);
        logger.info(`Redirecting to FACEIT auth URL: ${authUrl}`);
        res.redirect(authUrl);
    } catch (error) {
        logger.error(`Error generating auth URL: ${error.message}`);
        res.status(500).send("Authentication initialization failed.");
    }
});

app.get("/callback", async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            logger.error(`OAuth Error: ${error}`);
            return res.redirect(`/?error=${encodeURIComponent(error)}`);
        }

        if (!code) {
            logger.warn("No code provided - redirecting to login");
            return res.redirect("/?error=no_code");
        }

        if (state !== req.session.authState) {
            logger.warn("Invalid state parameter - possible CSRF attack");
            return res.redirect("/?error=invalid_state");
        }

        delete req.session.authState; // Clean up

        const token = await FaceitJS.getAccessTokenFromCode(code);
        logger.info(`Access token obtained: ${token.access_token}`);

        const userInfo = await FaceitJS.getUserInfo(token.access_token);
        logger.info(`User info retrieved: ${userInfo.nickname}`);

        req.session.accessToken = token.access_token;
        req.session.user = userInfo;

        res.redirect("/dashboard");
    } catch (err) {
        logger.error(`Error during OAuth callback: ${err.message}`);
        res.redirect("/?error=auth_failed");
    }
});


// Favicon route to prevent unnecessary errors
app.get('/favicon.ico', (req, res) => res.status(204)); // No content

// Start the server
const PORT = env.PORT || 3000; // Default to 3000 if PORT is not set
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});
