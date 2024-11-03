// auth.js

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FACEIT_CLIENT_ID = process.env.FACEIT_CLIENT_ID;
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.FACEIT_REDIRECT_URI;

let tokens = {};

const auth = {
    async getAccessToken(code) {
        try {
            const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token', {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                client_id: FACEIT_CLIENT_ID,
                client_secret: FACEIT_CLIENT_SECRET
            });
            tokens = response.data;
            return tokens;
        } catch (error) {
            console.error('Error getting access token:', error);
            throw error;
        }
    },

    async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token', {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: FACEIT_CLIENT_ID,
                client_secret: FACEIT_CLIENT_SECRET
            });
            tokens = response.data;
            return tokens;
        } catch (error) {
            console.error('Error refreshing access token:', error);
            throw error;
        }
    },

    getCurrentTokens() {
        return tokens;
    }
};

export default auth;