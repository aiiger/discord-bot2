// FaceitJS.js
import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

export class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
        this.authEndpoint = 'https://accounts.faceit.com/oauth/authorize';
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;

        // Validate environment variables
        const requiredEnv = ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI', 'HUB_ID', 'FACEIT_API_KEY'];
        requiredEnv.forEach((envVar) => {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        });

        this.accessToken = null;
        this.refreshToken = null;

        // Create Axios instances for different API endpoints
        this.oauthInstance = axios.create({
            baseURL: 'https://api.faceit.com',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Data API instance with API key auth
        this.dataApiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });

        // Chat API instance with OAuth token auth
        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        this.setupInterceptors();
    }

    setupInterceptors() {
        // OAuth instance interceptors
        this.oauthInstance.interceptors.request.use(
            (config) => {
                if (this.accessToken) {
                    config.headers.Authorization = `Bearer ${this.accessToken}`;
                } else if (this.clientId && this.clientSecret) {
                    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
                    config.headers.Authorization = `Basic ${credentials}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Chat API instance interceptors
        this.chatApiInstance.interceptors.request.use(
            (config) => {
                if (this.accessToken) {
                    config.headers.Authorization = `Bearer ${this.accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Common response interceptor
        const responseInterceptor = async (error) => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
                originalRequest._retry = true;
                try {
                    await this.refreshAccessToken();
                    originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
                    return axios(originalRequest);
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    throw refreshError;
                }
            }

            return Promise.reject(error);
        };

        this.oauthInstance.interceptors.response.use(
            (response) => response,
            responseInterceptor
        );

        this.chatApiInstance.interceptors.response.use(
            (response) => response,
            responseInterceptor
        );
    }

    // PKCE Helper Methods
    generateCodeVerifier() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        return verifier;
    }

    generateCodeChallenge(verifier) {
        const hash = crypto.createHash('sha256');
        hash.update(verifier);
        return hash.digest('base64url');
    }

    // OAuth2 PKCE Authorization
    async getAuthorizationUrl(state) {
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'openid profile email',
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        return {
            url: `${this.authEndpoint}?${params.toString()}`,
            codeVerifier
        };
    }

    async exchangeCodeForToken(code, codeVerifier) {
        try {
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code_verifier: codeVerifier
            });

            const response = await this.oauthInstance.post('/auth/v1/oauth/token', params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            return response.data;
        } catch (error) {
            console.error('Failed to exchange code for token:', error);
            throw new Error(`Failed to exchange code for token: ${error.message}`);
        }
    }

    // Hub Methods
    async getHubDetails(hubId = this.hubId, expanded = []) {
        try {
            const params = new URLSearchParams();
            if (expanded.length > 0) {
                params.append('expanded', expanded.join(','));
            }

            const response = await this.dataApiInstance.get(`/hubs/${hubId}?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Failed to get hub details:', error);
            throw new Error(`Failed to get hub details: ${error.message}`);
        }
    }

    async getHubMatches(hubId = this.hubId, type = 'ongoing', offset = 0, limit = 20) {
        try {
            const params = new URLSearchParams({
                type,
                offset: offset.toString(),
                limit: limit.toString()
            });

            const response = await this.dataApiInstance.get(`/hubs/${hubId}/matches?${params.toString()}`);
            return response.data.items;
        } catch (error) {
            console.error('Failed to get hub matches:', error);
            throw new Error(`Failed to get hub matches: ${error.message}`);
        }
    }

    // Match Methods
    async getMatchDetails(matchId) {
        try {
            const response = await this.dataApiInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            console.error('Failed to get match details:', error);
            throw new Error(`Failed to get match details: ${error.message}`);
        }
    }

    async getMatchStats(matchId) {
        try {
            const response = await this.dataApiInstance.get(`/matches/${matchId}/stats`);
            return response.data;
        } catch (error) {
            console.error('Failed to get match stats:', error);
            throw new Error(`Failed to get match stats: ${error.message}`);
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await this.dataApiInstance.post(`/matches/${matchId}/rehost`);
            return response.data;
        } catch (error) {
            console.error('Failed to rehost match:', error);
            throw new Error(`Failed to rehost match: ${error.message}`);
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await this.dataApiInstance.post(`/matches/${matchId}/cancel`);
            return response.data;
        } catch (error) {
            console.error('Failed to cancel match:', error);
            throw new Error(`Failed to cancel match: ${error.message}`);
        }
    }

    // Chat Methods
    async getRoomDetails(roomId) {
        try {
            const response = await this.chatApiInstance.get(`/rooms/${roomId}`);
            return response.data;
        } catch (error) {
            console.error('Failed to get room details:', error);
            throw new Error(`Failed to get room details: ${error.message}`);
        }
    }

    async getRoomMessages(roomId, before = '', limit = 50) {
        try {
            const params = new URLSearchParams();
            if (before) params.append('before', before);
            if (limit) params.append('limit', limit.toString());

            const response = await this.chatApiInstance.get(`/rooms/${roomId}/messages?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Failed to get room messages:', error);
            throw new Error(`Failed to get room messages: ${error.message}`);
        }
    }

    async sendRoomMessage(roomId, message) {
        try {
            const response = await this.chatApiInstance.post(`/rooms/${roomId}/messages`, {
                message: message
            });
            return response.data;
        } catch (error) {
            console.error('Failed to send room message:', error);
            throw new Error(`Failed to send room message: ${error.message}`);
        }
    }

    // Authentication Methods
    async authenticateWithClientCredentials() {
        try {
            const response = await this.oauthInstance.post(
                '/auth/v1/oauth/token',
                'grant_type=client_credentials',
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                    }
                }
            );
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token || null;
            console.log('Authenticated with client credentials.');
            return response.data;
        } catch (error) {
            console.error('Client credentials authentication failed:', error);
            throw new Error(`Client credentials authentication failed: ${error.message}`);
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available.');
        }

        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: this.clientId,
                client_secret: this.clientSecret
            });

            const response = await this.oauthInstance.post('/auth/v1/oauth/token', params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            console.log('Access token refreshed.');
            return response.data;
        } catch (error) {
            console.error('Failed to refresh access token:', error);
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }

    // Event handling for match state changes
    startPolling() {
        this.previousMatchStates = new Map();

        setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);
                activeMatches.forEach(match => {
                    const prevState = this.previousMatchStates.get(match.id);
                    if (prevState && prevState !== match.state) {
                        this.emit('matchStateChange', match);
                    }
                    this.previousMatchStates.set(match.id, match.state);
                });
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 60000); // Poll every minute
    }
}
