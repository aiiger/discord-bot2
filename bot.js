import axios from 'axios';
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const ELO_THRESHOLD = Number(process.env.ELO_THRESHOLD || '70');

let accessToken = '';
const processedMatches = new Set();
let voteCounts = {};

async function getAccessToken() {
  try {
    const response = await axios.post(
      'https://api.faceit.com/auth/v1/oauth/token',
      null,
      {
        params: {
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        },
      }
    );
    accessToken = response.data.access_token;
    console.log('Access token obtained.');
  } catch (error) {
    console.error('Error obtaining access token:', error.message);
    throw error;
  }
}

async function fetchMatches() {
  try {
    console.log(`Fetching matches for hub ${FACEIT_HUB_ID}`);
    const response = await axios.get(
      `https://open.faceit.com/data/v4/hubs/${FACEIT_HUB_ID}/matches?type=ongoing&offset=0&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const matches = response.data.items;
    console.log(`Found ${matches.length} matches.`);
    return matches;
  } catch (error) {
    console.error('Error fetching matches:', error.message);
    return [];
  }
}

async function sendMatchMessage(roomId, message) {
  try {
    const response = await axios.post(
      `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
      {
        message: message,
        // Adjust the payload if necessary
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending match message:', error.message);
    throw error;
  }
}

async function processMatch(match) {
  const matchId = match.match_id;
  const roomId = match.chat_room_id;

  // Skip if we've already processed this match
  if (!processedMatches.has(matchId)) {
    processedMatches.add(matchId);

    // Send greeting message
    const greetingMessage = '👋 Hello players! Type !rehost to request a rehost or !cancel to cancel the match if ELO differential is above 70.';
    try {
      await sendMatchMessage(roomId, greetingMessage);
      console.log(`Sent greeting message for match ${matchId}`);
    } catch (error) {
      console.error(`Failed to send greeting message for match ${matchId}:`, error.message);
    }

    // Check ELO difference
    const faction1 = match.teams.faction1;
    const faction2 = match.teams.faction2;

    const faction1Rating = Number(faction1.stats.rating);
    const faction2Rating = Number(faction2.stats.rating);

    const ratingDiff = Math.abs(faction1Rating - faction2Rating);

    if (ratingDiff > ELO_THRESHOLD) {
      const higherTeam = faction1Rating > faction2Rating ? faction1 : faction2;
      const lowerTeam = faction1Rating > faction2Rating ? faction2 : faction1;

      const message = `⚠️ Warning: High ELO difference detected!\n${higherTeam.name} (${Math.round(
        higherTeam.stats.rating
      )}) vs ${lowerTeam.name} (${Math.round(lowerTeam.stats.rating)})\nDifference: ${Math.round(
        ratingDiff
      )} points`;

      try {
        await sendMatchMessage(roomId, message);
        console.log(`Sent warning message for match ${matchId}`);
      } catch (error) {
        console.error(`Failed to send message for match ${matchId}:`, error.message);
      }

      // Attempt to cancel the match (requires proper permissions)
      try {
        await cancelMatch(matchId);
        console.log(`Cancelled match ${matchId} due to high ELO difference.`);
      } catch (error) {
        console.error(`Failed to cancel match ${matchId}:`, error.message);
      }
    }

    // Initialize vote count
    voteCounts[matchId] = {
      rehostVotes: new Set(),
    };

    // Listen to chat messages
    listenToChat(roomId, matchId);
  }

  // Mark the match with a timestamp for cleanup
  processedMatches.add({ matchId, timestamp: Date.now() });
}

async function cancelMatch(matchId) {
  try {
    const response = await axios.delete(`https://open.faceit.com/data/v4/matches/${matchId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error cancelling match:', error.message);
    throw error;
  }
}

function listenToChat(roomId, matchId) {
  // Connect to the FACEIT chat via WebSocket
  // Note: This requires proper authentication and may require using a user access token
  console.log(`Listening to chat for match ${matchId} (Room ID: ${roomId})`);

  const wsUrl = `wss://chat-server.faceit.com?token=${accessToken}`; // Adjust the WebSocket URL as needed

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('WebSocket connection established');
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.room === roomId && message.type === 'message') {
      const text = message.text;
      const playerId = message.from.id;

      // Process '!rehost' command
      if (text.trim().toLowerCase() === '!rehost') {
        if (!voteCounts[matchId].rehostVotes.has(playerId)) {
          voteCounts[matchId].rehostVotes.add(playerId);
          const votes = voteCounts[matchId].rehostVotes.size;
          console.log(`Player ${playerId} voted to rehost. Total votes: ${votes}`);

          // Notify the chat
          sendMatchMessage(roomId, `Player ${message.from.nickname} voted to rehost. (${votes}/6)`);

          if (votes >= 6) {
            // Rehost the match
            rehostMatch(matchId, roomId);
          }
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for match ${matchId}:`, error.message);
  });

  ws.on('close', () => {
    console.log(`WebSocket connection closed for match ${matchId}`);
  });
}

async function rehostMatch(matchId, roomId) {
  try {
    await sendMatchMessage(roomId, 'Rehosting the match as per player votes.');

    // Rehost the match
    await axios.post(
      `https://open.faceit.com/data/v4/matches/${matchId}/rehost`,
      null,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log(`Match ${matchId} rehosted successfully.`);
  } catch (error) {
    console.error(`Failed to rehost match ${matchId}:`, error.message);
    sendMatchMessage(roomId, `Failed to rehost the match: ${error.message}`);
  }
}

/**
 * The main function to start the bot, obtain the access token, and continuously fetch and process matches.
 */
let shouldExit = false;

process.on('SIGINT', () => {
  console.log('Received SIGINT. Exiting gracefully...');
  shouldExit = true;
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Exiting gracefully...');
  shouldExit = true;
});

async function main() {
  await getAccessToken();

  while (!shouldExit) {
    const matches = await fetchMatches();
    console.log(`Processing ${matches.length} matches`);

    for (const match of matches) {
      await processMatch(match);
    }

    // Clean up old matches every 30 seconds
    const now = Date.now();
    for (const item of processedMatches) {
      if (now - item.timestamp > 3600000) { // 1 hour
        processedMatches.delete(item);
        delete voteCounts[item.matchId];
      }
    }

    // Wait for 30 seconds before next check
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }

  console.log('Exited gracefully.');
}

main().catch(console.error);
