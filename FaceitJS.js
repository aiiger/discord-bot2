// FaceitJS.js

const axios = require('axios');
const { URLSearchParams } = require('url');

// ***** FACEITJS CLASS ***** //
class FaceitJS {
    constructor() {
        this.baseUrl = 'https://api.faceit.com';
        this.authUrl = 'https://www.faceit.com/oauth/authorize';
        this.tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
        this.userInfoUrl = 'https://api.faceit.com/core/v1/users/me'; // Updated endpoint

        // Bind methods to the instance
        this.getAuthorizationUrl = this.getAuthorizationUrl.bind(this);
        this.getAccessTokenFromCode = this.getAccessTokenFromCode.bind(this);
        this.getUserInfo = this.getUserInfo.bind(this);
        this.getHubMatches = this.getHubMatches.bind(this); // Bind the new method
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
     * Retrieves match details for a specific hub.
     * @param {string} hubId - The ID of the hub.
     * @param {string} matchId - The ID of the match.
     * @returns {Object} - The match details.
     */
    async getHubMatches(hubId, matchId) {
        try {
            const response = await axios.get(`${this.baseUrl}/hubs/${hubId}/matches/${matchId}`);
            return response.data;
        } catch (error) {
            // Log detailed error information
            if (error.response) {
                throw new Error(`Hub Matches Retrieval Failed: ${error.response.data.error_description || error.response.data.error}`);
            } else {
                throw new Error(`Hub Matches Retrieval Failed: ${error.message}`);
            }
        }
    }
}

// ***** EXPORT THE FACEITJS CLASS ***** //
module.exports = FaceitJS;