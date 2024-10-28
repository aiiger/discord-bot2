import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const app = express();

// Environment Variables
const clientId = process.env.FACEIT_CLIENT_ID;
const clientSecret = process.env.FACEIT_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI || `https://meslx-13b51d23300b.herokuapp.com/callback`;
const hubId = process.env.FACEIT_HUB_ID;

let codeVerifier; // Declare globally
let accessToken;  // Declare globally

// Helper functions
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

// Step 2: Redirect to Faceit OAuth2 Authorization URL
app.get('/', (req, res) => {
  codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const faceitAuthUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  res.redirect(faceitAuthUrl);
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    console.log("No authorization code found.");
    res.send("No authorization code found. Please try logging in again.");
    return;
  }

  try {
    const tokenResponse = await axios.post('https://accounts.faceit.com/oauth/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    accessToken = tokenResponse.data.access_token;
    console.log("Access Token:", accessToken);

    res.send("Authenticated successfully! Access token received.");
  } catch (error) {
    console.error("Failed to fetch access token:", error.response?.data || error.message);
    res.send("Failed to authenticate. Please try again.");
  }
});

// Example of making an authenticated API call
app.get('/api', async (req, res) => {
  if (!accessToken) {
    return res.send("No access token available. Please authenticate first.");
  }

  try {
    const activeMatches = await axios.get(`https://open.faceit.com/data/v4/hubs/${hubId}/matches`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(activeMatches.data);
  } catch (error) {
    console.error("Failed to fetch data:", error.response?.data || error.message);
    res.send("Error fetching data. Make sure the bot is authenticated.");
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
