require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

let accessToken = null;
let activeMatchesCache = {};

app.get('/', (req, res) => {
  const authUrl = `https://accounts.faceit.com/oauth/authorize?response_type=code&client_id=${process.env.FACEIT_CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&scope=openid profile`;
  res.send(`<a href="${authUrl}">Authorize with Faceit</a>`);
});

app.get('/callback', async (req, res) => {
  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    console.error("Authorization code not found in query parameters.");
    return res.status(400).send("No authorization code found in the query parameters.");
  }

  try {
    const tokenResponse = await axios.post('https://api.faceit.com/auth/v1/oauth/token', {
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: process.env.REDIRECT_URI,
      client_id: process.env.FACEIT_CLIENT_ID,
      client_secret: process.env.FACEIT_CLIENT_SECRET
    });

    accessToken = tokenResponse.data.access_token;
    console.log("Access Token:", accessToken);

    res.send("Authorization successful. You can now use the Faceit API.");
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).send("Failed to exchange authorization code for access token.");
  }
});

async function getActiveMatches() {
  if (!accessToken) throw new Error("No access token. Please authenticate first.");

  const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${process.env.FACEIT_HUB_ID}/matches`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return response.data.items || [];
}

async function checkEloDifferential(match) {
  const teams = match.teams;
  if (!teams || !teams.faction1 || !teams.faction2) return false;

  const eloTeam1 = teams.faction1.players.reduce((sum, player) => sum + player.elo, 0) / teams.faction1.players.length;
  const eloTeam2 = teams.faction2.players.reduce((sum, player) => sum + player.elo, 0) / teams.faction2.players.length;
  const eloDifference = Math.abs(eloTeam1 - eloTeam2);

  console.log(`Elo difference for match ${match.match_id}: ${eloDifference}`);

  return eloDifference >= process.env.ELO_THRESHOLD;
}

let rehostVotes = {};

app.post('/vote-rehost/:matchId', (req, res) => {
  const matchId = req.params.matchId;
  const userId = req.query.user_id;

  if (!matchId || !userId) return res.status(400).send("Match ID and User ID required.");

  if (!rehostVotes[matchId]) rehostVotes[matchId] = new Set();
  rehostVotes[matchId].add(userId);

  const voteCount = rehostVotes[matchId].size;
  console.log(`Votes for rehost on match ${matchId}: ${voteCount}`);

  if (voteCount >= process.env.REHOST_VOTE_COUNT) {
    console.log(`Match ${matchId} will be rehosted as per vote.`);
    delete rehostVotes[matchId];
    return res.send(`Match ${matchId} will be rehosted.`);
  }

  res.send(`Vote received. Current count: ${voteCount}`);
});

async function monitorMatches() {
  try {
    const matches = await getActiveMatches();

    for (const match of matches) {
      const matchId = match.match_id;

      if (activeMatchesCache[matchId]) continue;
      activeMatchesCache[matchId] = true;

      const highEloDifference = await checkEloDifferential(match);
      if (highEloDifference) {
        console.log(`Match ${matchId} has a high Elo differential. Voting to cancel...`);
        // Add your code here for canceling the match if necessary
      }
    }
  } catch (error) {
    console.error("Error in match monitoring:", error.response ? error.response.data : error.message);
  }
}

setInterval(monitorMatches, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
