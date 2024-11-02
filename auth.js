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
        
        // Create the form data
        const formData = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: FACEIT_CLIENT_ID,
            client_secret: FACEIT_CLIENT_SECRET
        });
        
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: formData.toString()
        });
        
        console.log('Token response:', {
            access_token: 'REDACTED',
            token_type: response.data.token_type,
            expires_in: response.data.expires_in,
            scope: response.data.scope
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
        
        const formData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh_token,
            client_id: FACEIT_CLIENT_ID,
            client_secret: FACEIT_CLIENT_SECRET
        });
        
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: formData.toString()
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

function getAuthUrl() {
    // Using the exact scope names from FACEIT
    const scopes = [
        'openid',
        'profile',
        'email',
        'chat.messages.read',
        'chat.messages.write',
        'chat.rooms.read'
    ];
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: FACEIT_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: scopes.join(' '),
        state: Math.random().toString(36).substring(7)  // Add state parameter for security
    });
    
    const url = `${AUTH_URL}?${params.toString()}`;
    console.log('Auth URL:', url);
    return url;
}

module.exports = {
    getAccessToken,
    refreshToken,
    getAuthUrl
};
