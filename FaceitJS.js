// FaceitJS.js

// ***** IMPORTS ***** //
import axios from 'axios';
import logger from './logger.js'; // Import the Winston logger

// CHAMPIONSHIPS
import getChampionshipsById from './endpoints/championships/getChampionshipsById.js';

// HUBS
import getHubsById from './endpoints/hubs/getHubsById.js';

class FaceitJS {
    constructor(apiKeyServerSide, apiKeyClientSide) {
        this.apiKeyServer = apiKeyServerSide;
        this.apiKeyClient = apiKeyClientSide;
        this.authState = null;
    }

    // ***** API KEY GETTERS AND SETTERS ***** //
    getApiKeyServer() {
        return this.apiKeyServer;
    }

    setApiKeyServer(apiKeyServerSide) {
        this.apiKeyServer = apiKeyServerSide;
    }

    getApiKeyClient() {
        return this.apiKeyClient;
    }

    setApiKeyClient(apiKeyClientSide) {
        this.apiKeyClient = apiKeyClientSide;
    }

    // ***** HEADER GENERATION ***** //
    getHeader() {
        return {
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${this.apiKeyServer}`,
            },
        };
    }

    // ***** AUTHORIZATION URL GENERATION ***** //
    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.FACEIT_CLIENT_ID,
            redirect_uri: process.env.REDIRECT_URI,
            scope: 'openid profile email',
            state: state,
        });

        // Use the correct OAuth2 authorization endpoint
        return `https://api.faceit.com/auth/v1/oauth/authorize?${params.toString()}`;
    }

    // ***** TOKEN EXCHANGE ***** //
    async getAccessTokenFromCode(code) {
        try {
            const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';

            const credentials = Buffer.from(
                `${process.env.FACEIT_CLIENT_ID}:${process.env.FACEIT_CLIENT_SECRET}`
            ).toString('base64');

            const data = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI,
            });

            const response = await axios.post(tokenUrl, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`,
                },
            });

            // Validate response
            if (!response.data.access_token) {
                throw new Error('Access token not found in response');
            }

            return response.data;
        } catch (error) {
            logger.error(`Error getting access token: ${error.response?.data || error.message}`);
            throw error;
        }
    }

    // ***** USER INFO RETRIEVAL ***** //
    async getUserInfo(accessToken) {
        try {
            const response = await axios.get(
                'https://api.faceit.com/auth/v1/resources/userinfo',
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`Error getting user info: ${error.response?.data || error.message}`);
            throw error;
        }
    }

    // ***** CHAMPIONSHIP ACTIONS ***** //

    /**
     * Rehost a championship event.
     * @param {string} eventId - The ID of the championship event.
     * @param {string} gameId - The ID of the game.
     * @returns {Promise<Object>} - The response data from the API.
     */
    async rehostChampionship(eventId, gameId) {
        try {
            const url = `https://api.faceit.com/championships/v1/events/${eventId}/rehost`;
            const data = { gameId };
            const headers = this.getHeader();
            const response = await axios.post(url, data, headers);
            return response.data;
        } catch (error) {
            logger.error(`Error rehosting championship: ${error.response?.data || error.message}`);
            throw error;
        }
    }

    /**
     * Cancel a championship event.
     * @param {string} eventId - The ID of the championship event.
     * @returns {Promise<Object>} - The response data from the API.
     */
    async cancelChampionship(eventId) {
        try {
            const url = `https://api.faceit.com/championships/v1/events/${eventId}/cancel`;
            const headers = this.getHeader();
            const response = await axios.post(url, {}, headers);
            return response.data;
        } catch (error) {
            logger.error(`Error canceling championship: ${error.response?.data || error.message}`);
            throw error;
        }
    }
}

// ***** ADD PROTOTYPE METHODS ***** //

// CHAMPIONSHIPS
FaceitJS.prototype.getChampionshipsById = getChampionshipsById;
FaceitJS.prototype.championshipsById = getChampionshipsById;

// HUBS
FaceitJS.prototype.getHubsById = getHubsById;
FaceitJS.prototype.hubsById = getHubsById;

// ***** EXPORT THE FACEITJS CLASS ***** //

export default FaceitJS;
