import { Client, GatewayIntentBits } from 'discord.js';
import { FaceitJS } from './FaceitJS.js';
import dotenv from 'dotenv';
import { env } from 'node:process';
import express from 'express';
import logger from './logger.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Basic route to keep the app alive
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// Start Express server
app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const faceit = new FaceitJS();

client.on('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    try {
        await faceit.initialize();
        logger.info('FACEIT client initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize FACEIT client:', error);
    }
});

// Handle match state changes
faceit.onMatchStateChange(async (match) => {
    try {
        logger.info(`Match ${match.id} state changed to ${match.state}`);
        // For now, just log the match state change
        // We can implement player notifications later when we have the required API methods
    } catch (error) {
        logger.error('Error handling match state change:', error);
    }
});

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();

    // For now, just acknowledge commands
    // We can implement the full functionality once we have the required API methods
    if (command === '!cancel') {
        message.reply('Cancel command received. This feature will be implemented soon.');
    } else if (command === '!rehost') {
        message.reply('Rehost command received. This feature will be implemented soon.');
    }
});

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    // Don't exit the process, just log the error
});

// Login to Discord
client.login(env.DISCORD_TOKEN).catch(error => {
    logger.error('Failed to login to Discord:', error);
});
