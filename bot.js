const crypto = require("crypto");
const axios = require("axios");
const express = require("express");
const app = express();

const clientId = "07d7bf2a-4144-4658-ae0a-865c082a2267"; // Replace with your OAuth client ID
const redirectUri = "https://meslx-13b51d23300b.herokuapp.com/callback"; // Replace with your redirect URI, e.g., "http://localhost:3000/callback"
const hubId = "322ddc42-30b2-427c-a1eb-360be2c9b622"; // Replace with your FACEIT hub ID

let accessToken;

// Step 1: Generate Code Verifier and Code Challenge
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Step 2: Construct Authorization URL
const authorizationUrl = `https://accounts.faceit.com/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

// Step 3: Serve Authorization URL
app.get("/", (req, res) => {
  res.send(`<a href="${authorizationUrl}">Authorize with FACEIT</a>`);
});

// Step 4: Handle the Callback and Exchange Code for Access Token
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    res.send("No authorization code found in the query parameters.");
    return;
  }

  try {
    const tokenUrl = "https://accounts.faceit.com/token";
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", clientId);
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("code_verifier", codeVerifier);

    const response = await axios.post(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    accessToken = response.data.access_token;
    res.send("Access token retrieved successfully! You can now fetch match data.");
  } catch (error) {
    console.error("Error fetching access token:", error.response?.data || error.message);
    res.send("Error fetching access token.");
  }
});

// Step 5: Fetch Match Info from the Hub
app.get("/get-matches", async (req, res) => {
  if (!accessToken) {
    res.send("Access token is missing. Please authenticate first.");
    return;
  }

  try {
    const url = `https://open.faceit.com/data/v4/hubs/${hubId}/matches`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching match info:", error.response?.data || error.message);
    res.send("Error fetching match info.");
  }
});

// Step 5: Fetch Match Info from the Hub
app.get("/get-matches", async (req, res) => {
  if (!accessToken) {
    res.send("Access token is missing. Please authenticate first.");
    return;
  }

  try {
    const url = `https://open.faceit.com/data/v4/hubs/${hubId}/matches`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching match info:", error.response?.data || error.message);
    res.send("Error fetching match info.");
  }
});

// Step 6: Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${3001}`);
  console.log(`Go to http://localhost:${3001} to initiate authentication.`);
});
