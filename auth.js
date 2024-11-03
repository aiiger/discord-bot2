// auth.js

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.FACEIT_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// OpenID Configuration endpoints
const TOKEN_ENDPOINT = 'https://api.faceit.com/auth/v1/oauth/token';
const USERINFO_ENDPOINT = 'https://api.faceit.com/auth/v1/resources/userinfo';

const TOKEN_FILE = path.join(__dirname, '.tokens.json');

// Token storage with file persistence
let tokenCache = {
    access_token: null,
    refresh_token: null,
    expires_at: null
};

// Load tokens from file if exists
try {
    if (fs.existsSync(TOKEN_FILE)) {
        tokenCache = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
} catch (error) {
    console.error('Error loading tokens from file:', error);
}

// Save tokens to file
function saveTokens(tokens) {
    try {
        tokenCache = {
            ...tokens,
            expires_at: Date.now() + (tokens.expires_in * 1000)
        };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenCache), 'utf8');
    } catch (error) {
        console.error('Error saving tokens to file:', error);
    }
}

async function getAccessToken(code) {
    try {
        const response = await axios({
            method: 'post',
            url: TOKEN_ENDPOINT,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile email chat.messages.read chat.messages.write chat.rooms.read'
            }).toString()
        });

        // Save tokens
        saveTokens(response.data);
        return response.data;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;
    }
}

async function refreshAccessToken(refreshToken) {
    try {
        const response = await axios({
            method: 'post',
            url: TOKEN_ENDPOINT,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                scope: 'openid profile email chat.messages.read chat.messages.write chat.rooms.read'
            }).toString()
        });

        // Save new tokens
        saveTokens(response.data);
        return response.data;
    } catch (error) {
        console.error('Error refreshing access token:', error.response?.data || error.message);
        throw error;
    }
}

async function getUserInfo(accessToken) {
    try {
        const response = await axios({
            method: 'get',
            url: USERINFO_ENDPOINT,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting user info:', error.response?.data || error.message);
        throw error;
    }
}

// Get current tokens
function getCurrentTokens() {
    // Check if token is expired
    if (tokenCache.expires_at && Date.now() >= tokenCache.expires_at) {
        if (tokenCache.refresh_token) {
            // Token is expired, try to refresh it
            return refreshAccessToken(tokenCache.refresh_token)
                .then(tokens => tokens)
                .catch(error => {
                    console.error('Error refreshing expired token:', error);
                    return tokenCache;
                });
        }
    }
    return tokenCache;
}

// Clear tokens (for logout)
function clearTokens() {
    tokenCache = {
        access_token: null,
        refresh_token: null,
        expires_at: null
    };
    try {
        fs.unlinkSync(TOKEN_FILE);
    } catch (error) {
        console.error('Error clearing token file:', error);
    }
}

module.exports = {
    getAccessToken,
    refreshAccessToken,
    getUserInfo,
    getCurrentTokens,
    clearTokens
};
