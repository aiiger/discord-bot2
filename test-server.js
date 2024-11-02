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
const port = 3002;

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
            }
        );

        // Save tokens to .env file
        const envContent = `\nFACEIT_ACCESS_TOKEN=${tokenResponse.data.access_token}\nFACEIT_REFRESH_TOKEN=${tokenResponse.data.refresh_token}\nTOKEN_EXPIRES_AT=${Date.now() + (tokenResponse.data.expires_in * 1000)}`;
        
        res.send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication successful!</h2>
                    <p>The bot is now authorized to use chat commands.</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error.message);
        res.status(500).send(`
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #1f1f1f; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center; padding: 20px; border-radius: 8px; background-color: #2d2d2d; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <h2>Authentication failed</h2>
                    <p>Error: ${error.response?.data?.message || error.message}</p>
                    <p>Please try again.</p>
                </div>
            </body>
            </html>
        `);
    }
});

app.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
});
