const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
let accessToken = null;

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

app.get('/', (req, res) => {
  const authUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${process.env.FACEIT_CLIENT_ID}&response_type=code&redirect_uri=${process.env.REDIRECT_URI}&scope=openid`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const authorizationCode = req.query.code;
  
  if (!authorizationCode) {
    return res.status(400).send("No authorization code found.");
  }

  try {
    const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token', {
      client_id: process.env.FACEIT_CLIENT_ID,
      client_secret: process.env.FACEIT_CLIENT_SECRET,
      code: authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: process.env.REDIRECT_URI,
    });

    accessToken = response.data.access_token;
    console.log("Access Token:", accessToken);

    res.send("Successfully authenticated and received access token.");
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    res.status(500).send("Error exchanging code for token.");
  }
});

// Example function to get active matches
const getActiveMatches = async () => {
  try {
    const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${process.env.FACEIT_HUB_ID}/matches`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data.items;
  } catch (error) {
    console.error("Error fetching active matches:", error);
    return [];
  }
};
