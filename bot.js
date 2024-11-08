// ***** IMPORTS ***** //
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

// Create Redis client at the top level
let redisClient;

const initializeApp = async () => {
    try {
        // Initialize Redis client
        redisClient = Redis.createClient({
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

        // Your existing routes...

        // Start server
        const PORT = env.PORT || 3000;
        const server = app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
        });

        // Graceful shutdown
        const shutdown = async () => {
            try {
                logger.info('Shutting down server...');
                
                // Close HTTP server first
                await new Promise((resolve) => {
                    server.close(resolve);
                });
                logger.info('HTTP server closed');

                // Close Redis client if it exists and is connected
                if (redisClient && redisClient.isOpen) {
                    await redisClient.quit();
                    logger.info('Redis client disconnected');
                }

                process.exit(0);
            } catch (err) {
                logger.error('Error during shutdown:', err);
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

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