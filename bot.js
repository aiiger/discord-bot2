require('dotenv').config();
const { Client, Intents } = require('discord.js');
const axios = require('axios');

// Initialize Discord Bot
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

// Faceit API Configuration
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_BASE_URL = 'https://open.faceit.com/data/v4';

// Bot Constants
const ELO_DIFFERENTIAL_THRESHOLD = 770;
const REHOST_VOTE_THRESHOLD = 6;

// Event: Bot Ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Event: Message Create
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Example Command: !avote
    if (message.content.startsWith('!avote')) {
        const args = message.content.split(' ').slice(1);
        const matchId = args[0]; // Assume match ID is provided as an argument

        if (!matchId) {
            return message.reply('Please provide a valid match ID.');
        }

        try {
            // Fetch Match Details from Faceit API
            const matchResponse = await axios.get(`${FACEIT_BASE_URL}/matches/${matchId}`, {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            });

            const eloDifferential = calculateEloDifferential(matchResponse.data); // Implement this function based on your logic

            if (eloDifferential >= ELO_DIFFERENTIAL_THRESHOLD) {
                // Initiate Avote for Cancellation
                initiateAvote(matchId, message);
            } else {
                message.reply('Elo differential is not sufficient to initiate an avote.');
            }

        } catch (error) {
            console.error(error);
            message.reply('An error occurred while fetching match details.');
        }
    }

    // Example Command: !rehost
    if (message.content.startsWith('!rehost')) {
        const args = message.content.split(' ').slice(1);
        const matchId = args[0];

        if (!matchId) {
            return message.reply('Please provide a valid match ID.');
        }

        // Implement Rehost Logic
        rehostMatch(matchId, message);
    }
});

// Function to Calculate Elo Differential
function calculateEloDifferential(matchData) {
    // Implement your logic to calculate Elo differential based on matchData
    // Return the calculated differential
}

// Function to Initiate Avote
function initiateAvote(matchId, message) {
    // Implement your avote initiation logic
    // For example, send a message to the channel asking players to vote
    message.channel.send(`An avote has been initiated for match ID: ${matchId}. Do you want to cancel the match? React with 👍 to vote yes.`);
    
    // Add reaction collector to count votes
    const filter = (reaction, user) => reaction.emoji.name === '👍' && !user.bot;
    const collector = message.createReactionCollector({ filter, time: 60000 }); // 1 minute for voting

    collector.on('collect', (reaction, user) => {
        console.log(`Collected ${reaction.emoji.name} from ${user.tag}`);
    });

    collector.on('end', collected => {
        if (collected.size >= REHOST_VOTE_THRESHOLD) {
            // Rehost the match
            rehostMatch(matchId, message);
        } else {
            message.channel.send('Avote failed. Not enough votes to cancel the match.');
        }
    });
}

// Function to Rehost Match
async function rehostMatch(matchId, message) {
    try {
        // Implement your rehosting logic using Faceit API
        const rehostResponse = await axios.post(`${FACEIT_BASE_URL}/matches/${matchId}/rehost`, {}, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (rehostResponse.status === 200) {
            message.channel.send(`Match ID: ${matchId} has been successfully rehosted.`);
        } else {
            message.channel.send('Failed to rehost the match.');
        }

    } catch (error) {
        console.error(error);
        message.channel.send('An error occurred while trying to rehost the match.');
    }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
