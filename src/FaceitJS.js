const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

class FaceitJS {
    constructor() {
        this.accessToken = null;
        this.hubId = process.env.HUB_ID;
        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.setupAxiosInstances();
        this.loadSavedToken();
    }

    loadSavedToken() {
        try {
            const tokenPath = path.join(__dirname, 'token.json');
            if (fs.existsSync(tokenPath)) {
                const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                if (tokenData.accessToken) {
                    console.log('[FACEIT] Found saved token, restoring...');
                    this.setAccessToken(tokenData.accessToken);
                    return true;
                }
            }
        } catch (error) {
            console.error('[FACEIT] Error loading saved token:', error);
        }
        return false;
    }

    setupAxiosInstances() {
        console.log('[FACEIT] Setting up API instances');

        // Create axios instance for authenticated requests
        this.authenticatedApi = axios.create({
            baseURL: 'https://api.faceit.com',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor to add auth header
        this.authenticatedApi.interceptors.request.use((config) => {
            if (this.accessToken) {
                config.headers['Authorization'] = `Bearer ${this.accessToken}`;
            }
            return config;
        });

        // Add response interceptor for error handling
        this.authenticatedApi.interceptors.response.use(
            response => response,
            error => {
                console.error('[FACEIT] API Error:', error.message);
                if (error.response) {
                    console.error('[FACEIT] Response status:', error.response.status);
                    console.error('[FACEIT] Response data:', error.response.data);
                }
                if (error.response?.status === 401) {
                    console.log('[FACEIT] Token expired or invalid, clearing...');
                    this.setAccessToken(null);
                    // Try to load a saved token
                    if (!this.loadSavedToken()) {
                        throw new Error('Authentication required');
                    }
                }
                throw error;
            }
        );
    }

    setAccessToken(token) {
        this.accessToken = token;
        if (token) {
            console.log('[FACEIT] Access token set successfully');
            // Save token to file
            try {
                fs.writeFileSync(
                    path.join(__dirname, 'token.json'),
                    JSON.stringify({ accessToken: token }),
                    'utf8'
                );
                console.log('[FACEIT] Token saved to file');
            } catch (error) {
                console.error('[FACEIT] Error saving token to file:', error);
            }
        } else {
            console.log('[FACEIT] Access token cleared');
            // Remove token file
            try {
                const tokenPath = path.join(__dirname, 'token.json');
                if (fs.existsSync(tokenPath)) {
                    fs.unlinkSync(tokenPath);
                    console.log('[FACEIT] Token file removed');
                }
            } catch (error) {
                console.error('[FACEIT] Error removing token file:', error);
            }
        }
    }

    async getActiveMatches() {
        try {
            if (!this.accessToken) {
                // Try to load saved token
                if (!this.loadSavedToken()) {
                    throw new Error('Authentication required');
                }
            }

            console.log('[MATCHES] Fetching active matches');
            const response = await this.authenticatedApi.get(`/hubs/v1/hub/${this.hubId}/matches`);
            const matches = response.data.items || [];
            console.log(`[MATCHES] Retrieved ${matches.length} matches`);
            return matches;
        } catch (error) {
            console.error('[MATCHES] Error fetching matches:', error.message);
            if (error.response?.data) {
                console.error('[MATCHES] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async sendChatMessage(matchId, message) {
        try {
            if (!this.accessToken) {
                // Try to load saved token
                if (!this.loadSavedToken()) {
                    throw new Error('Authentication required');
                }
            }

            console.log(`[CHAT] Sending message to match ${matchId}`);
            const response = await this.authenticatedApi.post(
                `/chat/v1/rooms/match-${matchId}`,
                { message }
            );
            console.log(`[CHAT] Message sent successfully to match ${matchId}`);
            return response.data;
        } catch (error) {
            console.error(`[CHAT] Error sending message to match ${matchId}:`, error.message);
            if (error.response?.data) {
                console.error('[CHAT] Response data:', error.response.data);
            }
            throw error;
        }
    }
}

module.exports = { FaceitJS };
