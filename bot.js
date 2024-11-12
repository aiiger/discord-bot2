// Previous code remains the same until Discord message handler

// Handle Discord messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    try {
        switch (command) {
            case '!sendtest':
                if (args.length < 3) {
                    message.reply('Usage: !sendtest [matchId] [message]');
                    return;
                }

                const matchId = args[1];
                const testMessage = args.slice(2).join(' ');

                if (!faceitJS.accessToken) {
                    message.reply('Please authenticate first by visiting: ' + getBaseUrl(req) + '/auth/faceit');
                    return;
                }

                await faceitJS.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                    body: testMessage
                });
                message.reply(`Successfully sent message to match room ${matchId}`);
                logger.info(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
                break;

            case '!getmatches':
                try {
                    const matches = await faceitJS.getHubMatches(faceitJS.hubId);
                    if (matches && matches.length > 0) {
                        const matchInfo = matches.map(match => ({
                            match_id: match.match_id,
                            chat_room_id: match.chat_room_id,
                            state: match.state,
                            started_at: match.started_at,
                            finished_at: match.finished_at
                        }));
                        message.reply(`Recent matches:\n${JSON.stringify(matchInfo, null, 2)}`);
                    } else {
                        message.reply('No recent matches found.');
                    }
                } catch (error) {
                    message.reply('Error getting matches: ' + error.message);
                    logger.error('Error getting matches:', error);
                }
                break;

            case '!testhelp':
                const helpMessage = `
Available test commands:
!getmatches - Get recent matches from your hub
!sendtest [matchId] [message] - Send a custom message to match chat

Example:
1. Use !getmatches to get match IDs
2. Use !sendtest with a match ID to test messaging
`;
                message.reply(helpMessage);
                break;
        }
    } catch (error) {
        if (error.response?.status === 401) {
            message.reply('Authentication failed. Please try authenticating again.');
            faceitJS.accessToken = null;
        } else {
            message.reply(`Failed to execute command: ${error.message}`);
        }
        logger.error('[DISCORD] Error executing command:', error);
    }
});

// Rest of the code remains the same
