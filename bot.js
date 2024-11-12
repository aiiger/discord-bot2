// bot.js
import express from 'express';
import session from 'express-session';
import { FaceitJS } from './FaceitJS.js';
import authRouter from './auth.js';
import { Client, GatewayIntentBits, EmbedBuilder, Partials } from 'discord.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Initialize FaceitJS
const faceitJS = new FaceitJS();

// Middleware setup
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Make faceitJS available to routes
app.locals.faceitJS = faceitJS;

// Auth routes
app.use('/', authRouter);

// Discord logging functions
async function sendDiscordLog(type, data) {
    try {
        const logChannel = await client.channels.fetch(process.env.DISCORD_LOG_CHANNEL);
        if (!logChannel) {
            console.error('Log channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setTimestamp();

        switch (type) {
            case 'matchCreated':
                embed
                    .setColor('#0099ff')
                    .setTitle('🎮 New Match Created')
                    .setDescription(`Match ID: ${data.matchId}`)
                    .addFields(
                        { name: 'Status', value: data.status, inline: true },
                        { name: 'Team 1', value: data.teams.team1, inline: true },
                        { name: 'Team 2', value: data.teams.team2, inline: true }
                    );
                break;

            case 'vetoPhase':
                embed
                    .setColor('#ffa500')
                    .setTitle('🗺️ Map Veto Started')
                    .setDescription(`Match ID: ${data.matchId}`)
                    .addFields(
                        { name: 'Status', value: 'Veto phase in progress', inline: true }
                    );
                break;

            case 'matchComplete':
                embed
                    .setColor('#00ff00')
                    .setTitle('🏁 Match Completed')
                    .setDescription(`Match ID: ${data.matchId}`)
                    .addFields(
                        { name: 'Duration', value: data.duration || 'N/A', inline: true }
                    );
                break;

            case 'error':
                embed
                    .setColor('#ff0000')
                    .setTitle('❌ Error Occurred')
                    .setDescription(data.message)
                    .addFields(
                        { name: 'Details', value: data.details || 'No details provided', inline: true }
                    );
                break;

            case 'wsConnected':
                embed
                    .setColor('#00ff00')
                    .setTitle('🔌 WebSocket Connected')
                    .setDescription('Connection to FACEIT chat established');
                break;

            case 'wsDisconnected':
                embed
                    .setColor('#ff6b6b')
                    .setTitle('🔌 WebSocket Disconnected')
                    .setDescription('Connection to FACEIT chat lost');
                break;

            default:
                embed
                    .setColor('#808080')
                    .setTitle('📝 System Log')
                    .setDescription(JSON.stringify(data));
        }

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error sending Discord log:', error);
    }
}

// Discord command handling
client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'auth':
                const authUrl = `${process.env.BASE_URL}/auth/faceit`;
                const authEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('FACEIT Authentication')
                    .setDescription(`[Click here to authenticate](${authUrl})`)
                    .setTimestamp();
                await message.reply({ embeds: [authEmbed] });
                break;

            case 'getmatches':
                const matches = await faceitJS.getActiveMatches();
                const matchesEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Active FACEIT Matches')
                    .setTimestamp();

                if (matches.length === 0) {
                    matchesEmbed.setDescription('No active matches found');
                } else {
                    matches.forEach(match => {
                        matchesEmbed.addFields({
                            name: `Match ID: ${match.match_id}`,
                            value: `Status: ${match.status}\nMap: ${match.voting?.map?.pick?.[0] || 'TBA'}`
                        });
                    });
                }
                await message.reply({ embeds: [matchesEmbed] });
                break;

            case 'sendtest':
                if (!message.member.permissions.has('ADMINISTRATOR')) {
                    await message.reply('You need administrator permissions to use this command.');
                    return;
                }

                const matchId = args[0];
                const testMessage = args.slice(1).join(' ');

                if (!matchId || !testMessage) {
                    await message.reply('Usage: !sendtest [matchId] [message]');
                    return;
                }

                const success = await faceitJS.sendTestMessage(matchId, testMessage);
                await message.reply(success ?
                    '✅ Test message sent successfully' :
                    '❌ Failed to send test message'
                );
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Available Commands')
                    .addFields(
                        { name: '!auth', value: 'Get the FACEIT authentication URL' },
                        { name: '!getmatches', value: 'View all active matches' },
                        { name: '!sendtest', value: 'Send a test message to a match (Admin only)' },
                        { name: '!help', value: 'Show this help message' }
                    )
                    .setTimestamp();
                await message.reply({ embeds: [helpEmbed] });
                break;
        }
    } catch (error) {
        console.error('Error handling Discord command:', error);
        await message.reply('An error occurred while processing the command.');
        await sendDiscordLog('error', {
            message: 'Discord Command Error',
            details: error.message,
            command: command
        });
    }
});

// FaceitJS event listeners
faceitJS.on('newMatch', async (match) => {
    await sendDiscordLog('matchCreated', {
        matchId: match.match_id,
        status: match.status,
        teams: {
            team1: match.teams.faction1.name,
            team2: match.teams.faction2.name
        }
    });
});

faceitJS.on('vetoStarted', async (match) => {
    await sendDiscordLog('vetoPhase', {
        matchId: match.match_id
    });
});

faceitJS.on('matchComplete', async (data) => {
    await sendDiscordLog('matchComplete', {
        matchId: data.matchId,
        duration: data.match.duration
    });
});

faceitJS.on('wsConnected', () => {
    sendDiscordLog('wsConnected', {});
});

faceitJS.on('wsMaxReconnectAttempts', () => {
    sendDiscordLog('wsDisconnected', {});
});

// Discord client setup
client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    sendDiscordLog('info', { message: 'Bot started successfully' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    sendDiscordLog('error', {
        message: 'Server Error',
        details: err.message
    });
    res.status(500).send('Something broke!');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        discordConnected: client.isReady(),
        wsConnected: faceitJS.wsConnection?.readyState === 1
    });
});

// Start the server
const startServer = async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            sendDiscordLog('info', {
                message: 'Server started',
                port: port
            });
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Starting graceful shutdown...');
    await sendDiscordLog('info', { message: 'Bot shutting down...' });

    faceitJS.stop();
    client.destroy();
    process.exit(0);
});

export default app;
