// auth.js

const axios = require('axios');
require('dotenv').config();

const CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.FACEIT_REDIRECT_URI || 'http://localhost:3000/auth/callback';
const AUTH_URL = 'https://cdn.faceit.com/widgets/sso/index.html';

function getAuthUrl() {
    return `${AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_popup=false&redirect_fragment=false&state=&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

async function getAccessToken(code) {
    const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
    try {
        const response = await axios({
            method: 'post',
            url: tokenUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
            data: {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;
    }
}

async function refreshAccessToken(refreshToken) {
    const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
    try {
        const response = await axios({
            method: 'post',
            url: tokenUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
            data: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error refreshing access token:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    getAuthUrl,
    getAccessToken,
    refreshAccessToken
};
