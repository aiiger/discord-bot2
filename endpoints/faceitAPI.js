import axios from 'axios';
import dotenv from 'dotenv';
import { URLSearchParams } from 'url';

dotenv.config();

const config = {
    clientId: process.env.FACEIT_CLIENT_ID,
    clientSecret: process.env.FACEIT_CLIENT_SECRET,
    authorizationUrl: 'https://api.faceit.com/auth/v1/oauth/authorize',
    tokenUrl: 'https://api.faceit.com/auth/v1/oauth/token',
    redirectUri: 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/auth/callback' // Ensure this is correct
};

export async function getAccessToken(authCode) {
    try {
        const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        const response = await axios.post(config.tokenUrl, new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: config.redirectUri
        }), {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
    }
}