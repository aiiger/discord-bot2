import 'dotenv/config';
import FaceitJS from './FaceitJS.js';
import logger from './logger.js';
import express from 'express';
import helmet from 'helmet';

// Validate required environment variables
const requiredEnvVars = ['FACEIT_API_KEY', 'HUB_ID'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// Log environment variables (without sensitive values)
logger.info('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not Set',
    FACEIT_API_KEY: process.env.FACEIT_API_KEY ? 'Set' : 'Not Set',
    HUB_ID: process.env.HUB_ID ? 'Set' : 'Not Set'
});

// Create Express app to handle webhooks
const app = express();

// Add security middleware
app.use(helmet());
app.use(express.json());

// Initialize FACEIT API client with server-side API key
const faceitJS = new FaceitJS(process.env.FACEIT_API_KEY);

// Maps to store match states and rehost votes
const matchStates = new Map();
const rehostVotes = new Map();
const greetedMatches = new Set();

// Basic health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        activeMatches: matchStates.size,
        greetedMatches: greetedMatches.size,
        rehostVotes: rehostVotes.size,
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Function to start monitoring matches
async function startMatchMonitoring() {
    try {
        // Validate API access first
        const isValid = await faceitJS.validateAccess();
        if (!isValid) {
            throw new Error('Failed to validate API access');
        }

        logger.info('Starting match monitoring...');

        // Poll for matches every 30 seconds
        setInterval(async () => {
            try {
                const matches = await faceitJS.getHubMatches(process.env.HUB_ID);
                if (!matches || !matches.items) {
                    logger.warn('No matches found in response');
                    return;
                }

                logger.debug(`Found ${matches.items.length} matches in hub`);

                // Process each match
                for (const match of matches.items) {
                    const previousState = matchStates.get(match.match_id);
                    const currentState = match.status;

                    // If state changed or new match
                    if (previousState !== currentState) {
                        logger.info(`Match ${match.match_id} state changed: ${previousState || 'NEW'} -> ${currentState}`);

                        try {
                            await handleMatchStateChange({
                                id: match.match_id,
                                previousState: previousState || 'NEW',
                                state: currentState,
                                details: match
                            });
                        } catch (error) {
                            logger.error(`Error handling match ${match.match_id}:`, error);
                        }
                    }
                }

                // Clean up old matches
                for (const [matchId, state] of matchStates) {
                    const matchExists = matches.items.some(m => m.match_id === matchId);
                    if (!matchExists) {
                        matchStates.delete(matchId);
                        logger.info(`Removed match ${matchId} from tracking`);
                    }
                }
            } catch (error) {
                logger.error('Error polling matches:', error);
                if (error.response) {
                    logger.error('Response details:', {
                        status: error.response.status,
                        data: error.response.data,
                        headers: error.response.headers
                    });
                }
            }
        }, 30000); // Poll every 30 seconds

    } catch (error) {
        logger.error('Error in match monitoring:', error);
        // Don't exit, let the process continue
    }
}

// Handle match state changes
async function handleMatchStateChange(match) {
    try {
        matchStates.set(match.id, match.state);

        // Get match details including chat room info
        const matchDetails = await faceitJS.getMatchDetails(match.id);
        logger.info(`Retrieved details for match ${match.id}`);

        // Get chat room ID from match details
        const chatRoomId = matchDetails.chat_room_id;
        if (!chatRoomId) {
            logger.error(`No chat room ID found for match ${match.id}`);
            return;
        }

        // Verify room exists before sending messages
        try {
            await faceitJS.getRoomDetails(chatRoomId);
            logger.info(`Verified chat room ${chatRoomId} exists`);
        } catch (roomError) {
            logger.error(`Failed to verify chat room ${chatRoomId}:`, roomError);
            return;
        }

        // Send greeting when match enters CONFIGURING state (map veto/lobby)
        if (match.state === 'CONFIGURING' && !greetedMatches.has(match.id)) {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Good luck and have fun! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;

            logger.info(`Sending greeting message for match ${match.id} to chat room ${chatRoomId}`);
            await faceitJS.sendRoomMessage(chatRoomId, greeting);
            logger.info(`Sent greeting message for match ${match.id}`);
            greetedMatches.add(match.id);
        }

        // Send other notifications based on state
        let notification = '';
        switch (match.state) {
            case 'ONGOING':
                notification = 'Match has started! Good luck and have fun!';
                break;
            case 'FINISHED':
                notification = 'Match has ended. Thanks for playing!';
                // Clear any existing votes and greeting status for this match
                rehostVotes.delete(match.id);
                greetedMatches.delete(match.id);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                // Clear any existing votes and greeting status for this match
                rehostVotes.delete(match.id);
                greetedMatches.delete(match.id);
                break;
        }

        if (notification) {
            logger.info(`Sending state change notification for match ${match.id} to chat room ${chatRoomId}: ${notification}`);
            await faceitJS.sendRoomMessage(chatRoomId, notification);
            logger.info(`Sent state change notification for match ${match.id}`);
        }
    } catch (error) {
        logger.error('Error handling match state change:', error);
        if (error.response) {
            logger.error('Response details:', {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            });
        }
        throw error;
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // Don't exit, let the process continue
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, let the process continue
});

// Start Express server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    logger.info(`FACEIT Bot started on port ${PORT}`);
}).on('error', (error) => {
    logger.error('Failed to start server:', error);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        logger.info('Server closed. Exiting process.');
        process.exit(0);
    });
});

// Start match monitoring
startMatchMonitoring();

// Keep the process alive and log status periodically
setInterval(() => {
    logger.info('Bot Status:', {
        activeMatches: matchStates.size,
        greetedMatches: greetedMatches.size,
        rehostVotes: rehostVotes.size,
        uptime: process.uptime()
    });
}, 300000); // Log every 5 minutes
