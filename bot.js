import { Client, GatewayIntentBits } from 'discord.js';
import { FaceitJS } from './FaceitJS.js';
import dotenv from 'dotenv';
import { env } from 'node:process';
import express from 'express';

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
    console.log(`Server is running on port ${port}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const faceit = new FaceitJS();
const rehostVotes = new Map(); // Store rehost votes per match
const REQUIRED_VOTES = 6; // Number of votes needed for rehost

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    faceit.initialize().catch(console.error);
});

// Handle match state changes
faceit.onMatchStateChange(async (match) => {
    if (match.state === 'CONFIGURING') {
        const players = await faceit.getPlayersInMatch(match.id);
        const welcomeMessage = `Welcome to the match! Map veto will begin shortly. Type !cancel to check for elo differential or !rehost if you're experiencing technical issues.`;

        // Send welcome message to each player
        for (const player of players) {
            try {
                await faceit.sendChatMessage(player.id, welcomeMessage);
            } catch (error) {
                console.error(`Failed to send welcome message to ${player.nickname}:`, error);
            }
        }
    }
});

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();
    const matchId = await getCurrentMatchId(message.author.id);

    if (!matchId) {
        message.reply('You must be in an active match to use this command.');
        return;
    }

    if (command === '!cancel') {
        try {
            const players = await faceit.getPlayersInMatch(matchId);
            const team1Avg = await calculateTeamAvgElo(players.slice(0, 5));
            const team2Avg = await calculateTeamAvgElo(players.slice(5, 10));
            const eloDiff = Math.abs(team1Avg - team2Avg);

            if (eloDiff >= 70) {
                await faceit.cancelMatch(matchId);
                message.reply(`Match cancelled due to elo differential of ${eloDiff}.`);
            } else {
                message.reply(`Cannot cancel match. Elo differential (${eloDiff}) is less than 70.`);
            }
        } catch (error) {
            console.error('Error handling cancel command:', error);
            message.reply('Failed to process cancel request.');
        }
    }

    if (command === '!rehost') {
        try {
            let votes = rehostVotes.get(matchId) || new Set();
            votes.add(message.author.id);
            rehostVotes.set(matchId, votes);

            if (votes.size >= REQUIRED_VOTES) {
                await faceit.rehostMatch(matchId);
                rehostVotes.delete(matchId);
                message.reply('Match is being rehosted.');
            } else {
                message.reply(`Rehost vote registered (${votes.size}/${REQUIRED_VOTES} votes needed).`);
            }
        } catch (error) {
            console.error('Error handling rehost command:', error);
            message.reply('Failed to process rehost request.');
        }
    }
});

async function calculateTeamAvgElo(players) {
    const elos = await Promise.all(players.map(player => faceit.getPlayerElo(player.id)));
    return elos.reduce((sum, elo) => sum + elo, 0) / players.length;
}

// This function needs to be implemented based on your database structure
async function getCurrentMatchId(userId) {
    // TODO: Implement the logic to get the current match ID for a Discord user
    // This could involve querying a database that maps Discord IDs to FACEIT matches
    console.log(`Getting match ID for user: ${userId}`);
    return null;
}

// Error handling
client.on('error', console.error);

// Handle unhandled promise rejections
globalThis.process?.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(env.DISCORD_TOKEN);
