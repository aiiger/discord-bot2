// ***** IMPORTS ***** //
import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { cleanEnv, str, url as envUrl, port } from 'envalid';
import FaceitJS from './FaceitJS.js';
import logger from './logger.js';

// Load environment variables
dotenv.config();

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
app.set("trust proxy", 1);

// Initialize Redis and Express
const initializeApp = async () => {
    try {
        // Create Redis client
        const redisClient = createClient({
            url: env.REDIS_URL,
            socket: {
                tls: true,
                rejectUnauthorized: false,
            }
        });

        redisClient.on("error", (err) => {
            logger.error("Redis Client Error:", err);
        });

        redisClient.on("connect", () => {
            logger.info("Redis Client Connected");
        });

        // Connect to Redis
        await redisClient.connect();

        // Security middleware
        app.use(helmet());
        app.use(helmet.contentSecurityPolicy({
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
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
            message: "Too many requests from this IP, please try again later.",
        });
        app.use(limiter);

        // Logger setup
        app.use(morgan("combined", {
            stream: {
                write: (message) => {
                    logger.info(message.trim());
                },
            },
        }));

        // Initialize RedisStore
        const store = new RedisStore({
            client: redisClient,
            prefix: 'sess:'
        });

        // Session middleware
        app.use(session({
            store: store,
            secret: env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
            },
            name: 'sessionId',
        }));

        app.use(express.json());

        // Routes
        app.get("/", (req, res) => {
            try {
                if (req.session.accessToken) {
                    res.redirect("/dashboard");
                } else {
                    res.send(`<h1>Please log in with your FACEIT account to continue.</h1><a href="/auth">Login with FACEIT</a>`);
                }
            } catch (error) {
                logger.error(`Error in root route: ${error.message}`);
                res.status(500).send("Internal Server Error");
            }
        });

        app.get("/auth", async (req, res) => {
            try {
                const state = Math.random().toString(36).substring(2, 15);
                req.session.authState = state;
                const authUrl = FaceitJS.getAuthorizationUrl(state);
                logger.info(`Redirecting to FACEIT auth URL: ${authUrl}`);
                res.redirect(authUrl);
            } catch (error) {
                logger.error(`Error generating auth URL: ${error.message}`);
                res.status(500).send("Authentication initialization failed.");
            }
        });

        app.get("/callback", async (req, res) => {
            console.log(req.query); // Log the query parameters
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
        // Start server
        const PORT = env.PORT || 3000;
        app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
        });

    } catch (error) {
        logger.error('Failed to initialize application:', error);
        process.exit(1);
    }
};

// Start the application
initializeApp().catch(error => {
    logger.error('Application startup failed:', error);
    process.exit(1);
});