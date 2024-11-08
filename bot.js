// bot.js
import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'redis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { cleanEnv, str, url as envUrl, port } from 'envalid';
import FaceitJS from './FaceitJS.js';
import logger from './logger.js';

dotenv.config();

const env = cleanEnv(process.env, {
    FACEIT_CLIENT_ID: str(),
    FACEIT_CLIENT_SECRET: str(),
    REDIRECT_URI: envUrl(),
    FACEIT_API_KEY_SERVER: str(),
    SESSION_SECRET: str(),
    REDIS_URL: envUrl(),
    NODE_ENV: str({ choices: ["development", "production", "test"] }),
    PORT: port(),
});

const app = express();
app.set("trust proxy", 1);

// Initialize Redis and Express
const initializeApp = async () => {
    try {
        // Redis setup
        const redisClient = Redis.createClient({
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

        await redisClient.connect();

        // Session store
        const store = new RedisStore({ client: redisClient });

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

        // Routes matching the flow diagram
        app.get("/", (req, res) => {
            try {
                if (req.session.accessToken) {
                    res.redirect("/dashboard");
                } else {
                    // Step 3: User clicks button to link Partner account
                    res.send(`<h1>Please log in with your FACEIT account to continue.</h1><a href="/auth">Login with FACEIT</a>`);
                }
            } catch (error) {
                logger.error(`Error in root route: ${error.message}`);
                res.status(500).send("Internal Server Error");
            }
        });

        // Step 4: FACEIT opens Partner authorization page
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

        // Step 6: Partner redirects user to FACEIT with authorization code
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
                
                delete req.session.authState;

                // Step 7: FACEIT exchanges authorization code for access token
                const token = await FaceitJS.getAccessTokenFromCode(code);
                logger.info(`Access token obtained`);
                
                // Store tokens in session
                req.session.accessToken = token.access_token;
                req.session.refreshToken = token.refresh_token;
                req.session.idToken = token.id_token;

                // Get user info from ID token
                const userInfo = await FaceitJS.getUserInfo(token.access_token);
                logger.info(`User info retrieved`);
                req.session.user = userInfo;
                
                res.redirect("/dashboard");
            } catch (err) {
                logger.error(`Error during OAuth callback: ${err.message}`);
                res.redirect("/?error=auth_failed");
            }
        });

        // Protected route
        app.get("/dashboard", async (req, res) => {
            if (!req.session.accessToken) {
                return res.redirect("/");
            }
            try {
                const userInfo = await FaceitJS.getUserInfo(req.session.accessToken);
                res.json(userInfo);
            } catch (error) {
                logger.error(`Dashboard error: ${error.message}`);
                res.redirect("/?error=dashboard_failed");
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