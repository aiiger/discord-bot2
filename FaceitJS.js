// FaceitJS.js
const axios = require('axios');
const { URLSearchParams } = require('url');
const crypto = require('crypto');

// ***** FACEITJS CLASS ***** //
class FaceitJS {
    constructor() {
        this.baseUrl = 'https://api.faceit.com';
        this.authUrl = 'https://www.faceit.com/oauth/authorize';
        this.tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
        this.userInfoUrl = 'https://api.faceit.com/core/v1/users/me';
        this.accessToken = null;
        this.pollingInterval = null;

        // Bind methods to the instance
        this.getAuthorizationUrl = this.getAuthorizationUrl.bind(this);
        this.exchangeCodeForToken = this.exchangeCodeForToken.bind(this);
        this.getUserInfo = this.getUserInfo.bind(this);
        this.getHubMatches = this.getHubMatches.bind(this);
        this.getMatchesInConfigurationMode = this.getMatchesInConfigurationMode.bind(this);
        this.setAccessToken = this.setAccessToken.bind(this);
        this.startPolling = this.startPolling.bind(this);
        this.stopPolling = this.stopPolling.bind(this);
        this.getActiveMatches = this.getActiveMatches.bind(this);
        this.sendChatMessage = this.sendChatMessage.bind(this);
    }

    // Generate code verifier and challenge for PKCE
    generatePKCE() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto
            .createHash('sha256')
            .update(verifier)
            .digest('base64url');
        return { verifier, challenge };
    }

    /**
     * Generates the FACEIT OAuth authorization URL with PKCE.
     * @param {string} state - A unique string to maintain state between the request and callback.
     * @returns {Object} - The authorization URL and code verifier.
     */
    async getAuthorizationUrl(state) {
        const { verifier, challenge } = this.generatePKCE();

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.FACEIT_CLIENT_ID,
            redirect_uri: process.env.REDIRECT_URI,
            scope: 'openid profile email',
            state: state,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });

        return {
            url: `${this.authUrl}?${params.toString()}`,
            codeVerifier: verifier
        };
    }

    /**
     * Exchanges the authorization code for tokens using PKCE.
     * @param {string} code - The authorization code received from FACEIT.
     * @param {string} codeVerifier - The original code verifier.
     * @returns {Object} - The token response data.
     */
    async exchangeCodeForToken(code, codeVerifier) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI,
            client_id: process.env.FACEIT_CLIENT_ID,
            client_secret: process.env.FACEIT_CLIENT_SECRET,
            code_verifier: codeVerifier
        });

        try {
            const response = await axios.post(this.tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error_description || error.message);
        }
    }

    /**
     * Sets the access token for API calls.
     * @param {string} token - The access token.
     */
    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Retrieves user information using the access token.
     * @returns {Object} - The user's profile information.
     */
    async getUserInfo() {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            const response = await axios.get(this.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Get user info error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error_description || error.message);
        }
    }

    /**
     * Retrieves active matches from the hub.
     * @returns {Array} - List of active matches.
     */
    async getActiveMatches() {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            const response = await axios.get(`${this.baseUrl}/hubs/${process.env.HUB_ID}/matches`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return response.data.items || [];
        } catch (error) {
            console.error('Get active matches error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error_description || error.message);
        }
    }

    /**
     * Sends a message to a match chat room.
     * @param {string} matchId - The ID of the match.
     * @param {string} message - The message to send.
     */
    async sendChatMessage(matchId, message) {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            await axios.post(
                `${this.baseUrl}/match/v1/match/${matchId}/chat`,
                { message },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('Send chat message error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error_description || error.message);
        }
    }

    /**
     * Starts polling for match updates.
     */
    startPolling() {
        if (this.pollingInterval) {
            return;
        }

        this.pollingInterval = setInterval(async () => {
            try {
                const matches = await this.getActiveMatches();
                // Process matches as needed
                console.log(`Polling: Found ${matches.length} active matches`);
            } catch (error) {
                console.error('Polling error:', error);
                if (error.response?.status === 401) {
                    this.stopPolling();
                }
            }
        }, 30000); // Poll every 30 seconds
    }

    /**
     * Stops polling for match updates.
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

module.exports = { FaceitJS };
