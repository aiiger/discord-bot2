// Import necessary libraries
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;

// Global variables to store tokens
let accessToken = null;
let refreshToken = null;

// OAuth2 configuration
const clientId = process.env.FACEIT_CLIENT_ID;
const clientSecret = process.env.FACEIT_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI || `https://meslx-13b51d23300b.herokuapp.com/callback`;
const faceitAuthUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email`;

// Route to trigger authentication
app.get('/', (req, res) => {
  if (!accessToken) {
    return res.redirect(faceitAuthUrl);
  }
  res.send("Faceit Bot is running and authenticated.");
});

// Callback route to handle Faceit’s OAuth2 response
app.get('/callback', async (req, res) => {
  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    return res.send("No authorization code found in the query parameters.");
  }

  try {
    const tokenResponse = await axios.post('https://accounts.faceit.com/oauth/token', querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log("Successfully authenticated with Faceit.");
    res.send("Successfully authenticated. You can now close this page.");
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.send("Failed to authenticate.");
  }
});

// Function to check matches every 2 minutes
const checkMatches = async () => {
  if (!accessToken) {
    console.log("No access token available. Please authenticate first.");
    return;
  }

  try {
    const response = await axios.get(`https://open.faceit.com/data/v4/hubs/{your_hub_id}/matches`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Example: Add your match handling logic here
    console.log("Fetched matches:", response.data);

  } catch (error) {
    console.error("Error fetching matches:", error.response ? error.response.data : error.message);
  }
};

// Start checking matches every 2 minutes
setInterval(checkMatches, 2 * 60 * 1000);
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' https://accounts.faceit.com https://*.faceit.com; script-src 'self' https://accounts.faceit.com https://*.faceit.com; style-src 'self' 'unsafe-inline' https://accounts.faceit.com https://*.faceit.com; img-src 'self' https://accounts.faceit.com https://*.faceit.com;");
    next();
  });
  
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
