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
        
        const response = await axios({
            method: 'post',
            url: TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            auth: {
                username: FACEIT_CLIENT_ID,
                password: FACEIT_CLIENT_SECRET
            },
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }).toString()
        });
        
        console.log('Token response:', response.data);
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

function getAuthUrl() {
    // Basic required scopes
    const scopes = [
        'openid',
        'profile',
        'email',
        // Chat permissions
        'chat.messages.read',
        'chat.messages.write',
        'chat.rooms.read',
        'chat.rooms.write',
        // Match permissions
        'matches',
        'matches:read',
        'matches:write',
        // Tournament permissions
        'tournaments',
        'tournaments:read',
        'tournaments:write',
        // Hub permissions
        'hubs',
        'hubs:read',
        'hubs:write'
    ];
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: FACEIT_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: scopes.join(' ')  // Join scopes with space instead of +
    });
    
    const url = `${AUTH_URL}?${params.toString()}`;
    console.log('Auth URL:', url);
    return url;
}

module.exports = {
    getAccessToken,
    getAuthUrl
};
