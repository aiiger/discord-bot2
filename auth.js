const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const port = 3000;

const CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const AUTHORIZATION_URL = 'https://api.faceit.com/auth/v1/oauth/authorize';
const TOKEN_URL = 'https://api.faceit.com/auth/v1/oauth/token';

app.get('/login', (req, res) => {
    const authUrl = `${AUTHORIZATION_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=chat.read chat.write`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    try {
        const response = await axios.post(TOKEN_URL, querystring.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token } = response.data;
        res.send(`Access Token: ${access_token}`);
    } catch (error) {
        res.status(500).send('Error exchanging code for token');
    }
});

app.listen(port, () => {
    console.log(`OAuth2 server listening at http://localhost:${port}`);
});