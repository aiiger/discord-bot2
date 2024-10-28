import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 15100;
const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const HUB_ID = process.env.HUB_ID;

// Removed duplicate declaration of accessToken
let codeVerifier = null;  // Store the code verifier here for reuse in callback

// Generate PKCE code verifier and code challenge
function generatePKCE() {
    codeVerifier = crypto.randomBytes(32).toString("base64url"); // Generate a random code verifier
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url"); // Derive code challenge from verifier
    return codeChallenge;
}

// Start authentication by redirecting user to FACEIT's OAuth page
app.get("/", (_, res) => {
    const codeChallenge = generatePKCE();
    const authUrl = `https://accounts.faceit.com/auth?response_type=code&client_id=${FACEIT_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.send(`
        <h1>Faceit Bot is running.</h1>
        <p><a href="${authUrl}">Click here to authenticate with FACEIT</a></p>
    `);
});

let accessToken = null;

// Handle OAuth callback to save access token
app.get('/callback', async (req, res) => {
    const authorizationCode = req.query.code;
    if (!authorizationCode) {
        res.status(400).send('No authorization code found in the query parameters.');
        return;
    }

    try {
        const tokenResponse = await axios.post('https://api.faceit.com/oauth/token', {
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: process.env.REDIRECT_URI,
            client_id: process.env.FACEIT_CLIENT_ID,
            client_secret: process.env.FACEIT_CLIENT_SECRET,
            code_verifier: codeVerifier // if using PKCE
        });

        accessToken = tokenResponse.data.access_token;
        console.log("Access Token Received:", accessToken);
        res.redirect('/'); // Redirect to a page confirming successful authentication
    } catch (error) {
        console.error("Error fetching access token:", error);
        res.status(500).send('Failed to fetch access token');
    }
});

// Example function to check active matches
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
        // const activeMatches = response.data; // Commented out as it's not used
        // Process the active matches as needed
    } catch (error) {
        console.error("Error fetching active matches:", error);
    }
}

// Schedule active match checks
setInterval(checkActiveMatches, 2 * 60 * 1000); // Every 2 minutes


// Run checkActiveMatches every 2 minutes
setInterval(checkActiveMatches, 2 * 60 * 1000); // Changed from 5 mins to 2 mins

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
