const express = require('express');
const axios = require('axios');

const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/auth/callback';

// OAuth2 endpoints from OpenID configuration
const AUTH_URL = 'https://accounts.faceit.com';
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
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: FACEIT_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'openid profile email chat.messages.read chat.messages.write'
    });
    
    const url = `${AUTH_URL}?${params.toString()}`;
    console.log('Auth URL:', url);
    return url;
}

module.exports = {
    getAccessToken,
    getAuthUrl
};
