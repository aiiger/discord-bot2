// FACEIT OAuth2 Bot
import express from 'express';
import FaceitJS from './FaceitJS.js';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

dotenv.config();

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize FaceitJS instance with API key
const faceitJS = new FaceitJS(process.env.FACEIT_API_KEY);

// Store for rehost votes and match states
const rehostVotes = new Map(); // matchId -> Set of player IDs who voted
const matchStates = new Map(); // matchId -> match state

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        matchStates.set(match.id, match.state);
        const matchDetails = await faceitJS.getMatchDetails(match.id);

        // Send greeting when match starts
        if (match.state === 'READY') {
            const players = matchDetails.teams.faction1.roster.concat(matchDetails.teams.faction2.roster);
            const playerNames = players.map(p => p.nickname).join(', ');
            const greeting = `Welcome to the match, ${playerNames}! Type !rehost to vote for a rehost (6/10 votes needed) or !cancel to check if the match can be cancelled due to ELO difference.`;
            await faceitJS.sendRoomMessage(match.id, greeting);
        }

        // Send other notifications based on state
        let notification = '';
        switch (match.state) {
            case 'ONGOING':
                notification = 'Match has started! Good luck and have fun!';
                break;
            case 'FINISHED':
                notification = 'Match has ended. Thanks for playing!';
                rehostVotes.delete(match.id);
                break;
            case 'CANCELLED':
                notification = 'Match has been cancelled.';
                rehostVotes.delete(match.id);
                break;
        }

        if (notification) {
            await faceitJS.sendRoomMessage(match.id, notification);
        }
    } catch (error) {
        console.error('Error handling match state change:', error);
    }
});

// Check if match is in configuration or lobby phase
const isValidMatchPhase = (matchState) => {
    return matchState === 'READY' || matchState === 'CONFIGURING';
};

// Calculate average ELO for a team
const calculateTeamAvgElo = (team) => {
    const totalElo = team.roster.reduce((sum, player) => sum + player.elo, 0);
    return totalElo / team.roster.length;
};

// Handle chat commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const command = message.content.toLowerCase();

    try {
        // Get the active match
        const matches = await faceitJS.getHubMatches(process.env.HUB_ID);
        const activeMatch = matches.items[0];

        if (!activeMatch) {
            message.reply('No active matches found in the hub.');
            return;
        }

        const matchDetails = await faceitJS.getMatchDetails(activeMatch.match_id);
        const matchState = matchStates.get(activeMatch.match_id) || matchDetails.status;

        if (!isValidMatchPhase(matchState)) {
            message.reply('Commands can only be used during configuration phase or in matchroom lobby.');
            return;
        }

        if (command === '!cancel') {
            // Calculate team average ELOs
            const team1AvgElo = calculateTeamAvgElo(matchDetails.teams.faction1);
            const team2AvgElo = calculateTeamAvgElo(matchDetails.teams.faction2);
            const eloDiff = Math.abs(team1AvgElo - team2AvgElo);

            if (eloDiff >= 70) {
                await faceitJS.cancelMatch(activeMatch.match_id);
                message.reply(`Match cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Match has been cancelled due to ELO difference of ${eloDiff.toFixed(0)}.`
                );
            } else {
                message.reply(`Cannot cancel match. ELO difference (${eloDiff.toFixed(0)}) is less than 70.`);
            }
        } else if (command === '!rehost') {
            const playerId = message.author.id;

            if (!rehostVotes.has(activeMatch.match_id)) {
                rehostVotes.set(activeMatch.match_id, new Set());
            }

            const votes = rehostVotes.get(activeMatch.match_id);

            if (votes.has(playerId)) {
                message.reply('You have already voted for a rehost.');
                return;
            }

            votes.add(playerId);
            const currentVotes = votes.size;
            const requiredVotes = 6;

            if (currentVotes >= requiredVotes) {
                await faceitJS.rehostMatch(activeMatch.match_id);
                message.reply(`Match ${activeMatch.match_id} rehosted successfully (${currentVotes}/10 votes).`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Match has been rehosted (${currentVotes}/10 votes).`
                );
                rehostVotes.delete(activeMatch.match_id);
            } else {
                message.reply(`Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`);
                await faceitJS.sendRoomMessage(activeMatch.match_id,
                    `Rehost vote recorded (${currentVotes}/${requiredVotes} votes needed).`
                );
            }
        }
    } catch (error) {
        console.error('Error handling command:', error);
        message.reply('An error occurred while processing the command.');
    }
});

// Login to Discord and start monitoring
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Discord bot logged in successfully');
        faceitJS.startMonitoring(process.env.HUB_ID);
        console.log('Started FACEIT hub monitoring');
    })
    .catch(error => {
        console.error('Failed to login to Discord:', error);
        process.exit(1);
    });

// Start server with port retry logic
const startServer = (retryCount = 0) => {
    const maxRetries = 5;
    const retryPort = port + retryCount;

    app.listen(retryPort)
        .on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                if (retryCount < maxRetries) {
                    console.log(`Port ${retryPort} in use, trying ${retryPort + 1}...`);
                    startServer(retryCount + 1);
                } else {
                    console.error('Could not find an available port after maximum retries');
                    process.exit(1);
                }
            } else {
                console.error('Server error:', error);
                process.exit(1);
            }
        })
        .on('listening', () => {
            console.log(`Server running on port ${retryPort}`);
        });
};

startServer();

export default app;
