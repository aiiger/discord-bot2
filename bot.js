// bot.js

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');

// Faceit API Configuration
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const HUB_ID = process.env.FACEIT_HUB_ID; // Add your hub ID to .env
const FACEIT_BASE_URL = 'https://open.faceit.com/data/v4';

// Bot Constants
const ELO_DIFFERENTIAL_THRESHOLD = 770;
const REHOST_VOTE_THRESHOLD = 6;

// Function to Fetch Active Matches from the Hub
async function getActiveMatches() {
  try {
    const response = await axios.get(`${FACEIT_BASE_URL}/hubs/${HUB_ID}/matches`, {
      headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
      },
    });
    return response.data.matches; // Adjust based on actual API response structure
  } catch (error) {
    console.error('Error fetching active matches:', error.response ? error.response.data : error.message);
    return [];
  }
}

// Function to Fetch Match Details
async function fetchMatchDetails(matchId) {
  try {
    const response = await axios.get(`${FACEIT_BASE_URL}/matches/${matchId}`, {
      headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching match ${matchId}:`, error.response ? error.response.data : error.message);
    return null;
  }
}

// Function to Calculate Elo Differential
function calculateEloDifferential(matchData) {
  const team1Elo = matchData.team1.stats.rating;
  const team2Elo = matchData.team2.stats.rating;
  return Math.abs(team1Elo - team2Elo);
}

// Function to Initiate Avote
async function initiateAvote(matchId) {
  try {
    // Assuming Faceit has an endpoint to initiate avotes
    // Replace with the actual endpoint and payload as per Faceit API documentation
    const response = await axios.post(`${FACEIT_BASE_URL}/matches/${matchId}/avote`, {}, {
      headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      console.log(`Avote initiated for match ID: ${matchId}`);
    } else {
      console.log(`Failed to initiate avote for match ID: ${matchId}`);
    }
  } catch (error) {
    console.error(`Error initiating avote for match ${matchId}:`, error.response ? error.response.data : error.message);
  }
}

// Function to Collect Votes (Placeholder)
async function collectVotes(matchId) {
  // Implement actual vote collection logic
  // This might involve polling an endpoint or listening to events
  // For demonstration, return a placeholder value
  return REHOST_VOTE_THRESHOLD; // Simulate enough votes
}

// Function to Rehost Match
async function rehostMatch(matchId) {
  try {
    // Assuming Faceit has an endpoint to rehost matches
    // Replace with the actual endpoint and payload as per Faceit API documentation
    const response = await axios.post(`${FACEIT_BASE_URL}/matches/${matchId}/rehost`, {}, {
      headers: {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
      console.log(`Match ID: ${matchId} has been successfully rehosted.`);
    } else {
      console.log(`Failed to rehost match ID: ${matchId}`);
    }
  } catch (error) {
    console.error(`Error rehosting match ${matchId}:`, error.response ? error.response.data : error.message);
  }
}

// Main Function to Handle Match Logic
async function handleMatch(matchId) {
  const matchData = await fetchMatchDetails(matchId);
  if (!matchData) return;

  const eloDifferential = calculateEloDifferential(matchData);

  if (eloDifferential >= ELO_DIFFERENTIAL_THRESHOLD) {
    console.log(`Elo differential (${eloDifferential}) is sufficient to initiate an avote for match ${matchId}.`);
    await initiateAvote(matchId);

    // Collect votes
    const votes = await collectVotes(matchId);

    if (votes >= REHOST_VOTE_THRESHOLD) {
      await rehostMatch(matchId);
    } else {
      console.log(`Avote failed for match ${matchId}. Not enough votes.`);
    }
  } else {
    console.log(`Elo differential (${eloDifferential}) is not sufficient to initiate an avote for match ${matchId}.`);
  }
}

// Scheduled Task to Run Every 5 Minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Scheduled task: Checking active matches...');
  const activeMatches = await getActiveMatches();

  if (activeMatches.length === 0) {
    console.log('No active matches found.');
    return;
  }

  activeMatches.forEach(match => {
    handleMatch(match.match_id);
  });
});

// Initial Run
(async () => {
  console.log('Faceit bot started. Monitoring active matches every 5 minutes.');
  const activeMatches = await getActiveMatches();

  if (activeMatches.length === 0) {
    console.log('No active matches found on startup.');
    return;
  }

  activeMatches.forEach(match => {
    handleMatch(match.match_id);
  });
})();
