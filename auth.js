// auth.js

import { AuthorizationCode } from 'simple-oauth2';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const config = {
    client: {
        id: process.env.FACEIT_CLIENT_ID,
        secret: process.env.FACEIT_CLIENT_SECRET,
    },
    auth: {
        tokenHost: 'https://api.faceit.com',
        authorizePath: '/oauth/v1/authorize',
        tokenPath: '/oauth/v1/token',
    },
    options: {
        authorizationMethod: 'body', // Adjust based on Faceit's requirements
    },
};

const client = new AuthorizationCode(config);

let accessToken = null;

const AUTH_STATE = {
    // Temporary in-memory store for state parameters (use persistent storage in production)
    store: {},
    generate() {
        const state = crypto.randomBytes(16).toString('hex');
        // In production, associate state with user session
        this.store[state] = true;
        return state;
    },
    validate(state) {
        if (this.store[state]) {
            delete this.store[state];
            return true;
        }
        return false;
    },
};

const auth = {
    getAuthorizationUrl() {
        const state = AUTH_STATE.generate();
        const authorizationUri = client.authorizeURL({
            redirect_uri: process.env.FACEIT_REDIRECT_URI,
            scope: 'openid profile email chat.messages.read chat.messages.write chat.rooms.read', // Adjust scopes as needed
            state: state,
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

    getAuthState() {
        return AUTH_STATE;
    },
};

export default auth;