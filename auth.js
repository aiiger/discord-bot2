const express = require('express');
const axios = require('axios');

const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.NODE_ENV === 'production' 
    ? 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/auth/callback'
    : 'http://localhost:3000/auth/callback';

// OAuth2 endpoints from OpenID configuration
const AUTH_URL = 'https://api.faceit.com/auth/v1/oauth/authorize';
const TOKEN_URL = 'https://api.faceit.com/auth/v1/oauth/token';

async function getAccessToken(code) {
    try {
        console.log('Getting access token with code:', code);
        
        // Create the form data as specified in the docs
        const formData = new URLSearchParams();
        formData.append('code', code);
        formData.append('grant_type', 'authorization_code');
        
        // Use HTTP Basic Authentication for client credentials
        const auth = Buffer.from(`${FACEIT_CLIENT_ID}:${FACEIT_CLIENT_SECRET}`).toString('base64');
        
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data: formData
        });
        
        console.log('Token response:', {
            access_token: 'REDACTED',
            token_type: response.data.token_type,
            expires_in: response.data.expires_in,
            scope: response.data.scope,
            id_token: response.data.id_token ? 'PRESENT' : 'MISSING'
        });
        
        return response.data;
    } catch (error) {
        console.error('Token error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

async function refreshToken(refresh_token) {
    try {
        console.log('Refreshing access token');
        
        // Create the form data as specified in the docs
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', refresh_token);
        
        // Use HTTP Basic Authentication for client credentials
        const auth = Buffer.from(`${FACEIT_CLIENT_ID}:${FACEIT_CLIENT_SECRET}`).toString('base64');
        
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data: formData
        });
        
        console.log('Token refreshed successfully');
        return response.data;
    } catch (error) {
        console.error('Token refresh error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// We don't need getAuthUrl anymore since we're using their SDK
function getAuthUrl() {
    return '/';  // Just redirect to home page where SDK is initialized
}

module.exports = {
    getAccessToken,
    refreshToken,
    getAuthUrl
};
