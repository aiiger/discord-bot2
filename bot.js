const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

let accessToken = null; // This should be globally accessible

// Home route
app.get('/', (req, res) => {
    res.send('Faceit Bot is running.');
});

// Callback route to handle FACEIT OAuth2
app.get('/callback', async (req, res) => {
    const authorizationCode = req.query.code;
    if (!authorizationCode) {
        res.status(400).send('No authorization code found in the query parameters.');
        return;
    }

    try {
        // Request access token using the authorization code
        const tokenResponse = await axios.post('https://api.faceit.com/oauth/token', {
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: process.env.REDIRECT_URI,
            client_id: process.env.FACEIT_CLIENT_ID,
            client_secret: process.env.FACEIT_CLIENT_SECRET,
            code_verifier: process.env.CODE_VERIFIER // Only if PKCE is being used
        });

        // Save access token
        accessToken = tokenResponse.data.access_token;
        console.log("Access Token Received:", accessToken);

        res.redirect('/'); // Redirect back to home after successful auth
    } catch (error) {
        console.error("Error fetching access token:", error);
        res.status(500).send('Failed to fetch access token');
    }
});

// Function to check active matches
async function checkActiveMatches() {
    if (!accessToken) {
        console.log("No access token available. Please authenticate first.");
        return;
    }

    try {
        const response = await axios.get('https://open.faceit.com/data/v4/hubs/{hub_id}/matches', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        const activeMatches = response.data;
        if (activeMatches.length === 0) {
            console.log("No active matches found.");
        } else {
            console.log("Active matches:", activeMatches);
        }
    } catch (error) {
        console.error("Error fetching active matches:", error);
    }
}

// Schedule active match checks every 2 minutes
setInterval(checkActiveMatches, 2 * 60 * 1000); // 2 minutes

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
