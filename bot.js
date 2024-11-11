// Update the Discord message handler to use test-callback
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Check if message starts with !sendtest
    if (message.content.startsWith('!sendtest')) {
        const args = message.content.split(' ');

        // Check if we have both matchId and message
        if (args.length < 3) {
            message.reply('Usage: !sendtest [matchId] [message]');
            return;
        }

        const matchId = args[1];
        const testMessage = args.slice(2).join(' ');

        try {
            // Check if we have an access token
            if (!faceitJS.accessToken) {
                // Generate auth URL with test-callback
                const state = crypto.randomBytes(32).toString('hex');
                const testRedirectUri = process.env.REDIRECT_URI.replace('/callback', '/test-callback');
                const { url, codeVerifier } = await faceitJS.getAuthorizationUrl(state, testRedirectUri);

                // Store the message details to send after authentication
                if (!pendingMessages.has(state)) {
                    pendingMessages.set(state, {
                        matchId,
                        message: testMessage,
                        discordMessage: message,
                        codeVerifier,
                        timestamp: Date.now()
                    });

                    logger.info(`Stored pending message for state ${state}:`, {
                        matchId,
                        message: testMessage
                    });

                    // Send authentication URL only once
                    message.reply(`Please authenticate first by visiting: ${url}\nAfter authentication, the message will be sent automatically.`);
                }
                return;
            }

            // If we have an access token, send the message directly
            await faceitJS.sendRoomMessage(matchId, testMessage);
            message.reply(`Successfully sent message to match room ${matchId}`);
            logger.info(`[DISCORD] Test message sent to match ${matchId}: "${testMessage}"`);
        } catch (error) {
            message.reply(`Failed to send message: ${error.message}`);
            logger.error('[DISCORD] Error sending test message:', error);
        }
    }
});
