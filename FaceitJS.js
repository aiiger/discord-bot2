// FaceitJS.js

const axios = require('axios');
const { URLSearchParams } = require('url');

// ***** FACEITJS CLASS ***** //
class FaceitJS {
    constructor() {
        this.baseUrl = 'https://api.faceit.com';
        this.authUrl = 'https://api.faceit.com/auth/v1/oauth/authorize'; // Correct OAuth endpoint
        this.tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
        this.userInfoUrl = 'https://api.faceit.com/core/v1/users/me'; // Updated endpoint
    }

    /**
     * Generates the FACEIT OAuth authorization URL.
     * @param {string} state - A unique string to maintain state between the request and callback.
     * @returns {string} - The complete authorization URL.
     */
    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.FACEIT_CLIENT_ID,
            redirect_uri: process.env.REDIRECT_URI,
            scope: 'openid profile email',
            state: state,
        });
        return `${this.authUrl}?${params.toString()}`;
    }

    /**
     * Exchanges the authorization code for an access token.
     * @param {string} code - The authorization code received from FACEIT.
     * @returns {Object} - The access token response data.
     */
    async getAccessTokenFromCode(code) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI,
            client_id: process.env.FACEIT_CLIENT_ID,
            client_secret: process.env.FACEIT_CLIENT_SECRET,
        });

        try {
            const response = await axios.post(this.tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            return response.data;
        } catch (error) {
            // Log detailed error information
            if (error.response) {
                throw new Error(`Token Exchange Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Token Exchange Failed: ${error.message}`);
            }
        }
    }

    /**
     * Retrieves user information using the access token.
     * @param {string} accessToken - The access token obtained from FACEIT.
     * @returns {Object} - The user's profile information.
     */
    async getUserInfo(accessToken) {
        try {
            const response = await axios.get(this.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            return response.data;
        } catch (error) {
            // Log detailed error information
            if (error.response) {
                throw new Error(`User Info Retrieval Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`User Info Retrieval Failed: ${error.message}`);
            }
        }
    }

    /**
     * Retrieves championships by ID.
     * @param {string} id - The championship ID.
     * @returns {Object} - The championship data.
     */
    async getChampionshipsById(id) {
        try {
            const response = await axios.get(`${this.baseUrl}/championships/${id}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY_SERVER}`, // Ensure API key has necessary permissions
                },
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`Get Championships Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Get Championships Failed: ${error.message}`);
            }
        }
    }

    /**
     * Retrieves hubs by ID.
     * @param {string} id - The hub ID.
     * @returns {Object} - The hub data.
     */
    async getHubsById(id) {
        try {
            const response = await axios.get(`${this.baseUrl}/hubs/${id}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY_SERVER}`, // Ensure API key has necessary permissions
                },
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`Get Hubs Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Get Hubs Failed: ${error.message}`);
            }
        }
    }

    /**
     * Rehosts a championship.
     * @param {string} eventId - The event ID.
     * @param {string} gameId - The game ID.
     * @returns {Object} - The rehost response data.
     */
    async rehostChampionship(eventId, gameId) {
        try {
            const response = await axios.post(`${this.baseUrl}/championships/${eventId}/rehost`, { game_id: gameId }, {
                headers: {
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY_SERVER}`, // Ensure API key has necessary permissions
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`Rehost Championship Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Rehost Championship Failed: ${error.message}`);
            }
        }
    }

    /**
     * Cancels a championship.
     * @param {string} eventId - The event ID.
     * @returns {Object} - The cancellation response data.
     */
    async cancelChampionship(eventId) {
        try {
            const response = await axios.post(`${this.baseUrl}/championships/${eventId}/cancel`, {}, {
                headers: {
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY_SERVER}`, // Ensure API key has necessary permissions
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`Cancel Championship Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Cancel Championship Failed: ${error.message}`);
            }
        }
    }
}

// ***** EXPORT AN INSTANCE OF FACEITJS ***** //
const faceit = new FaceitJS();
module.exports = faceit;
