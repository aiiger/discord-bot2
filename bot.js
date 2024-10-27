const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 15100;
const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const HUB_ID = process.env.HUB_ID;

let accessToken = null;
let codeVerifier = null;  // Store the code verifier here for reuse in callback

// Generate PKCE code verifier and code challenge
function generatePKCE() {
    codeVerifier = crypto.randomBytes(32).toString("base64url"); // Generate a random code verifier
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url"); // Derive code challenge from verifier
    return codeChallenge;
}

// Start authentication by redirecting user to FACEIT's OAuth page
app.get("/", (req, res) => {
    const codeChallenge = generatePKCE();
    const authUrl = `https://accounts.faceit.com/auth?response_type=code&client_id=${FACEIT_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.send(`
        <h1>Faceit Bot is running.</h1>
        <p><a href="${authUrl}">Click here to authenticate with FACEIT</a></p>
    `);
});

// Handle OAuth callback from FACEIT
app.get("/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        console.error("No authorization code found in the query parameters.");
        return res.status(400).send("Error: No authorization code found.");
    }

    try {
        const tokenResponse = await axios.post("https://api.faceit.com/oauth/token", {
            client_id: FACEIT_CLIENT_ID,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier,  // Use the stored codeVerifier here
            client_secret: FACEIT_CLIENT_SECRET
        });

        accessToken = tokenResponse.data.access_token;
        console.log("Access Token Received:", accessToken);
        res.send("Authentication complete. You may close this tab.");
    } catch (error) {
        console.error("Error exchanging authorization code for access token:", error);
        res.status(500).send("Error during authentication. Please try again.");
    }
});

// Function to check active matches in the FACEIT hub
async function checkActiveMatches() {
    if (!accessToken) {
        console.error("No access token available. Please authenticate first.");
        return;
    }

    try {
        const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${HUB_ID}/matches`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const activeMatches = response.data.items || [];
        if (activeMatches.length === 0) {
            console.log("No active matches found in the hub.");
        } else {
            console.log("Active Matches:", activeMatches);
            // Logic for checking ELO differential and voting
            activeMatches.forEach(match => {
                // Example match processing logic
                console.log(`Processing match ID: ${match.match_id}`);
                // You can add code here to check conditions and trigger actions
            });
        }
    } catch (error) {
        console.error("Error fetching active matches:", error.response ? error.response.data : error.message);
    }
}

// Run checkActiveMatches every 2 minutes
setInterval(checkActiveMatches, 2 * 60 * 1000); // Changed from 5 mins to 2 mins

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
g