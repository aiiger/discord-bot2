const axios = require('axios');
const crypto = require('crypto');
const base64url = require('base64url');
const EventEmitter = require('events');

class FaceitJS extends EventEmitter {
    constructor() {
        super();
        console.log('[FACEIT] Client ID loaded successfully');
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.hubId = process.env.HUB_ID;
        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.accessToken = null;
        this.pollingInterval = null;
        this.lastMatchStates = new Map();
        console.log('[FACEIT] Setting up API instances');

        // Create axios instances
        this.authApi = axios.create({
            baseURL: 'https://api.faceit.com/auth/v1',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.mainApi = axios.create({
            baseURL: 'https://api.faceit.com',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    setAccessToken(token) {
        this.accessToken = token;
        this.mainApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    async generateCodeVerifier() {
        const verifier = base64url(crypto.randomBytes(32));
        return verifier;
    }

    async generateCodeChallenge(verifier) {
        const hash = crypto.createHash('sha256');
        hash.update(verifier);
        return base64url(hash.digest());
    }

    async getAuthorizationUrl(state) {
        const codeVerifier = await this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        console.log('[AUTH] Code verifier:', codeVerifier);
        console.log('[AUTH] Code challenge:', codeChallenge);
        console.log('[AUTH] Redirect URI:', this.redirectUri);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'openid profile',  // Removed chat scopes as they seem to be invalid
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
    }

    async exchangeCodeForToken(code, codeVerifier) {
        try {
            const response = await this.authApi.post('/oauth/token', {
                grant_type: 'authorization_code',
                code: code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            });

            return response.data;
        } catch (error) {
            console.error('[AUTH] Token exchange error:', error.response?.data || error.message);
            throw error;
        }
    }

    async refreshAccessToken(refreshToken) {
        try {
            const response = await this.authApi.post('/oauth/token', {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.clientId,
                client_secret: this.clientSecret
            });

            this.setAccessToken(response.data.access_token);
            return response.data;
        } catch (error) {
            console.error('[AUTH] Token refresh error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getHubMatches(hubId, type = 'ongoing') {
        try {
            const response = await this.mainApi.get(`/hubs/v1/hub/${hubId}/matches`, {
                params: { type }
            });
            return response.data.items;
        } catch (error) {
            console.error('[API] Get hub matches error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.mainApi.get(`/match/v2/match/${matchId}`);
            return response.data;
        } catch (error) {
            console.error('[API] Get match details error:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendRoomMessage(matchId, message) {
        try {
            const response = await this.mainApi.post(`/match/v1/match/${matchId}/chat`, {
                message
            });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[API] Send room message error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await this.mainApi.delete(`/match/v1/match/${matchId}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[API] Cancel match error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await this.mainApi.post(`/match/v1/match/${matchId}/rehost`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[API] Rehost match error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    startPolling() {
        if (this.pollingInterval) {
            console.log('[POLLING] Polling already active');
            return;
        }

        console.log('[POLLING] Starting match state polling');
        this.pollingInterval = setInterval(async () => {
            try {
                const matches = await this.getHubMatches(this.hubId);

                for (const match of matches) {
                    const previousState = this.lastMatchStates.get(match.match_id);
                    if (previousState && previousState !== match.state) {
                        this.emit('matchStateChange', {
                            id: match.match_id,
                            state: match.state,
                            previousState
                        });
                    }
                    this.lastMatchStates.set(match.match_id, match.state);
                }
            } catch (error) {
                console.error('[POLLING] Error polling match states:', error);
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
