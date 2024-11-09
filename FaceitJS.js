import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

dotenv.config();

export class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;

        this.accessToken = null;
        this.refreshToken = null;

        // Create two axios instances - one for OAuth flows and one for Data API
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

        this.setupInterceptors();
    }

    setupInterceptors() {
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

        this.oauthInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
                    originalRequest._retry = true;
                    try {
                        await this.refreshAccessToken();
                        originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
                        return this.oauthInstance(originalRequest);
                    } catch (refreshError) {
                        throw refreshError;
                    }
                }

                return Promise.reject(error);
            }
        );
    }

    async initialize() {
        if (!this.hubId) {
            throw new Error('HUB_ID environment variable is not set');
        }

        if (!this.apiKey) {
            throw new Error('FACEIT_API_KEY environment variable is not set');
        }

        await this.startPolling();
        return true;
    }

    async authenticateWithClientCredentials() {
        try {
            const response = await this.oauthInstance.post('/auth/v1/oauth/token',
                'grant_type=client_credentials',
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                    }
                }
            );
            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error) {
            throw new Error(`Client credentials authentication failed: ${error.message}`);
        }
    }

    async refreshAccessToken() {
        try {
            const response = await this.oauthInstance.post('/auth/v1/oauth/token', null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.dataApiInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get match details: ${error.message}`);
        }
    }

    async getPlayersInMatch(matchId) {
        try {
            const response = await this.dataApiInstance.get(`/matches/${matchId}/players`);
            return response.data.players || [];
        } catch (error) {
            throw new Error(`Failed to get players in match: ${error.message}`);
        }
    }

    async sendChatMessage(playerId, message) {
        try {
            const response = await this.dataApiInstance.post('/chat/messages', {
                to: playerId,
                message: message
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to send chat message: ${error.message}`);
        }
    }

    async rehostMatch(matchId) {
        try {
            const response = await this.dataApiInstance.post(`/matches/${matchId}/rehost`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to rehost match: ${error.message}`);
        }
    }

    async cancelMatch(matchId) {
        try {
            const response = await this.dataApiInstance.post(`/matches/${matchId}/cancel`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to cancel match: ${error.message}`);
        }
    }

    startPolling() {
        this.previousMatchStates = {};

        setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);
                activeMatches.forEach(match => {
                    const prevState = this.previousMatchStates[match.id];
                    if (prevState && prevState !== match.state) {
                        this.emit('matchStateChange', match);
                    }
                    this.previousMatchStates[match.id] = match.state;
                });
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 60000);
    }

    onMatchStateChange(callback) {
        this.on('matchStateChange', callback);
    }

    async getHubMatches(hubId) {
        try {
            const response = await this.dataApiInstance.get(`/hubs/${hubId}/matches`, {
                params: {
                    offset: 0,
                    limit: 20,
                    status: 'ONGOING'
                }
            });
            return response.data.items;
        } catch (error) {
            throw new Error(`Failed to get hub matches: ${error.message}`);
        }
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'openid profile email membership chat.messages.read chat.messages.write chat.rooms.read',
            state: state
        });

        return `https://accounts.faceit.com/oauth/authorize?${params.toString()}`;
    }
}