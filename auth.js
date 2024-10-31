import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;

const CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const TOKEN_URL = 'https://api.faceit.com/auth/v1/oauth/token';

app.get('/login', (_, res) => {
    const authUrl = `${AUTHORIZATION_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);

        const response = await axios.post(TOKEN_URL, params.toString(), {
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