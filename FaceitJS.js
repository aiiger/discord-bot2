// FaceitJS.js
const axios = require('axios');

class FaceitJS {
    constructor() {
        // Initialize configuration
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.tokenEndpoint = 'https://open.faceit.com/data/v4/oauth/token';
        this.userinfoEndpoint = 'https://open.faceit.com/data/v4/users/me';
        this.baseApiUrl = 'https://open.faceit.com/data/v4';

        // Initialize access token variables
        this.accessToken = null;
        this.refreshToken = null;

        // Initialize axios instance
        this.axiosInstance = axios.create({
            baseURL: this.baseApiUrl,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Interceptor to add Authorization header if accessToken is set
        this.axiosInstance.interceptors.request.use(
            (config) => {
                if (this.accessToken) {
                    config.headers['Authorization'] = `Bearer ${this.accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );
    }

    /**
     * Exchanges authorization code for access token.
     * @param {string} code - The authorization code received from FACEIT.
     * @returns {Object} - Token data containing access_token and refresh_token.
     */
    async getAccessTokenFromCode(code) {
        try {
            const response = await axios.post(this.tokenEndpoint, null, {
                params: {
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            // Update axios instance with new access token
            this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

            return response.data;
        } catch (error) {
            console.error('Access token error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    /**
     * Refreshes the access token using the refresh token.
     * @param {string} refreshToken - The refresh token.
     * @returns {Object} - New token data.
     */
    async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post(this.tokenEndpoint, null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            // Update axios instance with new access token
            this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

            return response.data;
        } catch (error) {
            console.error('Refresh token error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }

    /**
     * Retrieves user information using the access token.
     * @param {string} accessToken - The access token.
     * @returns {Object} - User information data.
     */
    async getUserInfo(accessToken) {
        if (!accessToken) {
            throw new Error('Access token is required');
        }

        try {
            const response = await axios.get(this.userinfoEndpoint, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                validateStatus: status => status === 200
            });

            return response.data;
        } catch (error) {
            console.error('User info error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    /**
     * Retrieves all active matches.
     * @returns {Array} - List of active matches.
     */
    async getActiveMatches() {
        try {
            const response = await this.axiosInstance.get('/matches', {
                params: {
                    limit: 100, // Adjust as needed
                    state: 'active' // Assuming 'active' is a valid state
                }
            });

            return response.data.items; // Adjust based on API response structure
        } catch (error) {
            console.error('Get active matches error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get active matches: ${error.message}`);
        }
    }

    /**
     * Retrieves players in a specific match.
     * @param {string} matchId - The ID of the match.
     * @returns {Array} - List of players in the match.
     */
    async getPlayersInMatch(matchId) {
        try {
            const response = await this.axiosInstance.get(`/matches/${matchId}/players`);
            return response.data.players || []; // Adjust based on API response
        } catch (error) {
            console.error(`Get players in match (${matchId}) error:`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get players in match: ${error.message}`);
        }
    }

    /**
     * Sends a chat message to a specific player.
     * Note: This requires appropriate permissions or API endpoints.
     * @param {string} playerId - The ID of the player.
     * @param {string} message - The message to send.
     */
    async sendChatMessage(playerId, message) {
        try {
            // Replace with the actual endpoint and required parameters
            const response = await this.axiosInstance.post(`/chat/messages`, {
                to: playerId,
                message: message
            });

            return response.data;
        } catch (error) {
            console.error(`Send chat message to (${playerId}) error:`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to send chat message: ${error.message}`);
        }
    }

    /**
     * Rehosts a specific match.
     * @param {string} matchId - The ID of the match to rehost.
     */
    async rehostMatch(matchId) {
        try {
            // Replace with the actual endpoint and required parameters
            const response = await this.axiosInstance.post(`/matches/${matchId}/rehost`);
            return response.data;
        } catch (error) {
            console.error(`Rehost match (${matchId}) error:`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to rehost match: ${error.message}`);
        }
    }

    /**
     * Cancels a specific match.
     * @param {string} matchId - The ID of the match to cancel.
     */
    async cancelMatch(matchId) {
        try {
            // Replace with the actual endpoint and required parameters
            const response = await this.axiosInstance.post(`/matches/${matchId}/cancel`);
            return response.data;
        } catch (error) {
            console.error(`Cancel match (${matchId}) error:`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to cancel match: ${error.message}`);
        }
    }
}

module.exports = FaceitJS;