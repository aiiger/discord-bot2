// auth.js

import { AuthorizationCode } from 'simple-oauth2';
import dotenv from 'dotenv';

dotenv.config();

const config = {
    client: {
        id: process.env.FACEIT_CLIENT_ID,
        secret: process.env.FACEIT_CLIENT_SECRET,
    },
    auth: {
        tokenHost: 'https://api.faceit.com',
        authorizePath: '/auth/v1/oauth/authorize',
        tokenPath: '/auth/v1/oauth/token',
    },
};

const client = new AuthorizationCode(config);

let accessToken = null;

const auth = {
    getAuthorizationUrl() {
        const authorizationUri = client.authorizeURL({
            redirect_uri: process.env.FACEIT_REDIRECT_URI,
            scope: 'openid profile email chat.messages.read chat.messages.write chat.rooms.read',
            state: 'random_state_string', // Generate a random string in production
        });
        return authorizationUri;
    },

    async getAccessTokenFromCode(code) {
        const tokenParams = {
            code,
            redirect_uri: process.env.FACEIT_REDIRECT_URI,
            scope: 'openid profile email chat.messages.read chat.messages.write chat.rooms.read',
        };

        try {
            const result = await client.getToken(tokenParams);
            accessToken = client.createToken(result.token);
            console.log('Access Token obtained.');
            return accessToken;
        } catch (error) {
            console.error('Access Token Error:', error.message);
            throw error;
        }
    },

    async refreshAccessToken() {
        if (accessToken && accessToken.expired()) {
            try {
                accessToken = await accessToken.refresh();
                console.log('Access Token refreshed.');
                return accessToken;
            } catch (error) {
                console.error('Token Refresh Error:', error.message);
                throw error;
            }
        }
        return accessToken;
    },

    getAccessToken() {
        return accessToken;
    },
};

export default auth;