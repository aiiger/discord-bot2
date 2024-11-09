const axios = require('axios');
const EventEmitter = require('events');

class FaceitJS extends EventEmitter {
    constructor() {
        super();
        // Initialize configuration
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.tokenEndpoint = 'https://open.faceit.com/data/v4/oauth/token';
        this.userinfoEndpoint = 'https://open.faceit.com/data/v4/users/me';
        this.baseApiUrl = 'https://open.faceit.com/data/v4';
        this.hubId = process.env.HUB_ID; // Ensure HUB_ID is set

        // Initialize access token variables
        this.accessToken = null;
        this.refreshToken = null;

        // Initialize axios instance
        this.axiosInstance = axios.create({
            baseURL: this.baseApiUrl,
            headers: {
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

    async getMatchDetails(matchId) {
        try {
            const response = await this.axiosInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get match details: ${error.message}`);
        }
    }

    async getHubMatches(hubId) {
        console.log(`Fetching matches for Hub ID: ${hubId}`);
        console.log('Authorization Header:', this.axiosInstance.defaults.headers['Authorization']);
        try {
            const response = await this.axiosInstance.get(`/hubs/${hubId}/matches`, {
                params: {
                    offset: 0,
                    limit: 20,
                    status: 'ONGOING'
                }
            });
            return response.data.items;
        } catch (error) {
            console.error('getHubMatches Error Response:', {
                status: error.response?.status,
                data: error.response?.data
            });
            throw new Error(`Failed to get hub matches: ${error.message}`);
        }
    }

    async getPlayersInMatch(matchId) {
        try {
            const response = await this.axiosInstance.get(`/matches/${matchId}/players`);
            return response.data.players || [];
        } catch (error) {
            throw new Error(`Failed to get players in match: ${error.message}`);
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await this.axiosInstance.post(`/matches/${matchId}/rehost`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to rehost match: ${error.message}`);
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await this.axiosInstance.post(`/matches/${matchId}/cancel`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to cancel match: ${error.message}`);
        }
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'user:info matches:read matches:write', // Ensure these scopes are correct
            state: state
        });

        return `https://open.faceit.com/oauth/authorize?${params.toString()}`;
    }

    /**
     * Starts polling for active matches and emits events on state changes.
     */
    startPolling() {
        if (!this.hubId) {
            console.error('HUB_ID is not set. Cannot start polling for matches.');
            return;
        }

        // Track the previous state of matches to detect changes
        this.previousMatchStates = {};

        setInterval(async () => {
            try {
                console.log('Polling for active matches...');
                const activeMatches = await this.getHubMatches(this.hubId);
                console.log(`Fetched ${activeMatches.length} active matches.`);
                activeMatches.forEach(match => {
                    const prevState = this.previousMatchStates[match.id];
                    if (prevState && prevState !== match.state) {
                        console.log(`Match ${match.id} state changed from ${prevState} to ${match.state}`);
                        // Emit an event when match state changes
                        this.emit('matchStateChange', match);
                    }
                    // Update the previous state
                    this.previousMatchStates[match.id] = match.state;
                });
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 60000); // Poll every minute
    }

    onMatchStateChange(callback) {
        this.on('matchStateChange', callback);
    }
}

module.exports = FaceitJS;