import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3002;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to index.html
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// OAuth callback route
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).send('No authorization code received');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://api.faceit.com/auth/v1/oauth/token', 
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/auth/callback'
            }), {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${process.env.FACEIT_CLIENT_ID}:${process.env.FACEIT_CLIENT_SECRET}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

        const { access_token } = tokenResponse.data;
        res.send(`Access Token: ${access_token}`);
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        res.status(500).send('Error exchanging code for token');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});