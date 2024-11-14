const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const EventEmitter = require('events');

dotenv.config();

class FaceitJS extends EventEmitter {
    constructor(app) {
        super();  // Initialize EventEmitter
        this.serverApiKey = process.env.FACEIT_API_KEY;
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.hubId = process.env.HUB_ID;
        this.redirectUri = process.env.REDIRECT_URI;
        this.pollingInterval = null;
        this.accessToken = null;

        if (!this.clientId) {
            console.error('[FACEIT] Client ID not found in environment variables');
        } else {
            console.log('[FACEIT] Client ID loaded successfully');
        }

        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.setupAxiosInstances();
    }

    setupAxiosInstances() {
        console.log('[FACEIT] Setting up API instances');

        // Create axios instance for Data API requests
        this.api = axios.create({
            baseURL: 'https://open.faceit.com/data/v4',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.serverApiKey}`
            }
        });

        // Create axios instance for Chat API requests
        this.chatApi = axios.create({
            baseURL: 'https://open.faceit.com/chat/v1',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add response interceptor for error handling
        const errorHandler = error => {
            console.error('[FACEIT] API Error:', error.message);
            if (error.response) {
                console.error('[FACEIT] Response status:', error.response.status);
                console.error('[FACEIT] Response data:', error.response.data);
            }
            throw error;
        };

        this.api.interceptors.response.use(response => response, errorHandler);
        this.chatApi.interceptors.response.use(response => response, errorHandler);
    }

    setAccessToken(token) {
        console.log('[FACEIT] Setting access token');
        this.accessToken = token;
        // Update chat API headers with the new access token
        this.chatApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    async getAuthorizationUrl(state) {
        try {
            // Generate code verifier
            const codeVerifier = crypto.randomBytes(32).toString('base64url');

            // Generate code challenge
            const codeChallenge = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');

            console.log('[AUTH] Code verifier:', codeVerifier);
            console.log('[AUTH] Code challenge:', codeChallenge);
            console.log('[AUTH] Redirect URI:', this.redirectUri);

            // Construct authorization URL
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: this.clientId,
                redirect_uri: this.redirectUri,
                scope: 'openid profile chat',  // Simplified scopes
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });

            const url = `https://accounts.faceit.com/oauth/authorize?${params}`;
            console.log('[AUTH] Authorization URL:', url);

            return {
                url,
                codeVerifier
            };
        } catch (error) {
            console.error('[AUTH] Error generating authorization URL:', error);
            throw error;
        }
    }

    async exchangeCodeForToken(code, codeVerifier) {
        try {
            console.log('[AUTH] Exchanging code for token');
            console.log('[AUTH] Code:', code);
            console.log('[AUTH] Code Verifier:', codeVerifier);
            console.log('[AUTH] Redirect URI:', this.redirectUri);

            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            });

            console.log('[AUTH] Token request parameters:', params.toString());

            const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            console.log('[AUTH] Token exchange successful');
            console.log('[AUTH] Response:', response.data);

            // Set the access token for future chat API requests
            this.setAccessToken(response.data.access_token);

            return response.data;
        } catch (error) {
            console.error('[AUTH] Error exchanging code for token:', error);
            if (error.response) {
                console.error('[AUTH] Response status:', error.response.status);
                console.error('[AUTH] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async getHubMatches(hubId, type = '') {
        try {
            console.log('[MATCHES] Fetching active matches');
            console.log('[MATCHES] Using Hub ID:', hubId);

            let params = new URLSearchParams({
                offset: '0',
                limit: '20'
            });

            if (type) {
                params.append('type', type);
            }

            const response = await this.api.get(`/hubs/${hubId}/matches?${params}`);
            const matches = response.data.items || [];

            console.log(`[MATCHES] Retrieved ${matches.length} matches`);

            // Log each match's details
            matches.forEach(match => {
                const status = match.status || match.state;
                console.log(`[MATCH ${match.match_id}] Status: ${status}, Teams: ${match.teams?.faction1?.name || 'TBD'} vs ${match.teams?.faction2?.name || 'TBD'}`);
            });

            return matches;
        } catch (error) {
            console.error('[MATCHES] Error fetching matches:', error.message);
            if (error.response?.data) {
                console.error('[MATCHES] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.api.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            console.error(`[MATCH] Error getting match details for ${matchId}:`, error.message);
            throw error;
        }
    }

    async sendRoomMessage(matchId, message) {
        try {
            if (!this.accessToken) {
                throw new Error('No access token available. User must authenticate first.');
            }

            console.log(`[CHAT] Sending message to match ${matchId}`);

            // Get match details
            const matchResponse = await this.api.get(`/matches/${matchId}`);
            const match = matchResponse.data;
            console.log(`[CHAT] Got match details for ${matchId}`);

            // Try to get the chat room ID from match details
            const roomId = match.chat_room_id || `match-${matchId}`;
            console.log(`[CHAT] Using room ID: ${roomId}`);

            // First try to get room details to verify access
            try {
                const roomResponse = await this.chatApi.get(`/rooms/${roomId}`);
                console.log(`[CHAT] Got room details:`, roomResponse.data);
            } catch (error) {
                console.log(`[CHAT] Could not get room details:`, error.message);
            }

            // Send message using user's access token
            const response = await this.chatApi.post(`/rooms/${roomId}/messages`, {
                body: message.replace(/^"|"$/g, '') // Remove any surrounding quotes
            });

            console.log(`[CHAT] Message sent successfully to match ${matchId}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error(`[CHAT] Error sending message to match ${matchId}:`, error.message);
            if (error.response?.data) {
                console.error('[CHAT] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await this.api.post(`/matches/${matchId}/rehost`);
            return response.data;
        } catch (error) {
            console.error(`[REHOST] Error rehosting match ${matchId}:`, error.message);
            throw error;
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await this.api.post(`/matches/${matchId}/cancel`);
            return response.data;
        } catch (error) {
            console.error(`[CANCEL] Error cancelling match ${matchId}:`, error.message);
            throw error;
        }
    }

    startPolling() {
        console.log('[POLLING] Starting match state polling');
        let lastStates = new Map();

        this.pollingInterval = setInterval(async () => {
            try {
                const matches = await this.getHubMatches(this.hubId);
                matches.forEach(match => {
                    const currentState = match.status || match.state;
                    const lastState = lastStates.get(match.match_id);

                    if (lastState && lastState !== currentState) {
                        this.emit('matchStateChange', {
                            id: match.match_id,
                            state: currentState,
                            previousState: lastState,
                            match: match
                        });
                    }

                    lastStates.set(match.match_id, currentState);
                });
            } catch (error) {
                console.error('[POLLING] Error during polling:', error);
            }
        }, 30000); // Poll every 30 seconds
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('[POLLING] Stopped match state polling');
        }
    }
}

module.exports = { FaceitJS };
