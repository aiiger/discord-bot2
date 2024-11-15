import axios from 'axios';
import crypto from 'crypto';
import base64url from 'base64url';
import { EventEmitter } from 'events';

export class FaceitJS extends EventEmitter {
    constructor() {
        super();
        console.log('[FACEIT] Client ID loaded successfully');
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;
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

        // Create axios instance for FACEIT API
        this.mainApi = axios.create({
            baseURL: 'https://open.faceit.com/data/v4',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor to include API key
        this.mainApi.interceptors.request.use((config) => {
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${this.apiKey}`
            };
            return config;
        });
    }

    setAccessToken(token) {
        this.accessToken = token;
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

        // Define the required scopes
        const scopes = [
            'openid',
            'profile',
            'chat.messages.read',
            'chat.messages.write',
            'chat.rooms.read'
        ].join(' ');

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: scopes,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const url = `https://accounts.faceit.com/oauth/authorize?${params}`;
        console.log('[AUTH] Authorization URL:', url);
        console.log('[AUTH] Using scopes:', scopes);

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
            console.log('[API] Making request with API Key:', this.apiKey);
            const response = await axios({
                method: 'get',
                url: `https://open.faceit.com/data/v4/hubs/${hubId}/matches`,
                params: { type },
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            console.log('[API] Response:', response.data);
            return response.data.items;
        } catch (error) {
            console.error('[API] Get hub matches error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await axios({
                method: 'get',
                url: `https://open.faceit.com/data/v4/matches/${matchId}`,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('[API] Get match details error:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendRoomMessage(matchId, message) {
        if (!this.accessToken) {
            console.error('[CHAT] No access token available for sending messages');
            return { success: false, error: 'No access token available' };
        }

        try {
            const roomId = `match-${matchId}`;
            console.log(`[CHAT] Sending message to room ${roomId}`);
            const response = await axios({
                method: 'post',
                url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
                data: { message },
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[CHAT] Message sent successfully to room ${roomId}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[CHAT] Send room message error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await axios({
                method: 'delete',
                url: `https://api.faceit.com/match/v1/match/${matchId}`,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[API] Cancel match error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await axios({
                method: 'post',
                url: `https://api.faceit.com/match/v1/match/${matchId}/rehost`,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
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
                            previousState,
                            chat_room_id: match.chat_room_id
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
