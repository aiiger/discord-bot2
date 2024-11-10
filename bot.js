import 'dotenv/config';
import FaceitJS from './FaceitJS.js';
import logger from './logger.js';

// Initialize FACEIT API client with server-side API key
const faceitJS = new FaceitJS(process.env.FACEIT_API_KEY);

// Maps to store match states and rehost votes
const matchStates = new Map();
const rehostVotes = new Map();
const greetedMatches = new Set();

// Handle match state changes
faceitJS.on('matchStateChange', async (match) => {
    try {
        logger.info(`Match ${match.id} state changed from ${match.previousState} to ${match.state}`);
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
            logger.error('Response status:', error.response.status);
            logger.error('Response data:', error.response.data);
        }
    }
});
