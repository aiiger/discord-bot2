const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 9044;

// OAuth variables
const CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.REDIRECT_URI || 'http://localhost:9044'}/callback`;
let accessToken = null;

// Faceit API and hub info
const HUB_ID = "your_hub_id_here"; // Replace with your actual hub ID

// Function to authenticate the bot
async function authenticate() {
    const authUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid%20email&state=xyz&code_challenge=abc&code_challenge_method=S256`;
    console.log(`Go to this URL to authorize the bot: ${authUrl}`);
}

// Endpoint to handle Faceit OAuth callback
app.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.send("No authorization code found in the query parameters.");
    }
    
    try {
        const response = await axios.post("https://api.faceit.com/auth/v1/oauth/token", {
            grant_type: "authorization_code",
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        });
        accessToken = response.data.access_token;
        console.log("Authenticated successfully!");
        res.send("Authenticated successfully!");
        postOnlineMessage(); // Post an "online" message to the lobby on successful auth
    } catch (error) {
        console.error("Error exchanging authorization code:", error);
        res.send("Failed to authenticate.");
    }
});

// Function to post a message in the matchroom lobby
async function postOnlineMessage() {
    if (!accessToken) {
        console.log("No access token. Cannot post message to lobby.");
        return;
    }
    try {
        const response = await axios.post(
            `https://open.faceit.com/data/v4/hubs/${HUB_ID}/lobby/messages`,
            { message: "Bot is now online!" },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log("Posted online message to lobby:", response.data);
    } catch (error) {
        console.error("Failed to post online message:", error.response?.data || error.message);
    }
}

// Function to check active matches and take actions
async function checkActiveMatches() {
    if (!accessToken) {
        console.log("No access token. Cannot check matches.");
        return;
    }

    try {
        const response = await axios.get(
            `https://open.faceit.com/data/v4/hubs/${HUB_ID}/matches`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const activeMatches = response.data.items || [];

        if (activeMatches.length === 0) {
            console.log("No active matches found.");
            return;
        }

        for (const match of activeMatches) {
            // Check ELO differential and apply logic as needed
            const eloDifferential = Math.abs(match.teams.faction1.avgElo - match.teams.faction2.avgElo);
            if (eloDifferential >= 70) {
                console.log(`Elo differential of ${eloDifferential} detected. Initiating vote to cancel match.`);
                // Additional logic to cancel or rehost goes here
            }
        }
    } catch (error) {
        console.error("Error fetching active matches:", error.response?.data || error.message);
    }
}

// Start checking matches every 2 minutes
setInterval(checkActiveMatches, 2 * 60 * 1000); // 2 minutes in milliseconds

// Server setup to display bot status
app.get("/", (req, res) => {
    res.send("Faceit Bot is running and checking matches every 2 minutes.");
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    authenticate(); // Start authentication flow
});
