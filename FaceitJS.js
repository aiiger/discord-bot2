import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { env } from 'node:process';

dotenv.config();

export class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
        this.clientId = env.CLIENT_ID;
        this.clientSecret = env.CLIENT_SECRET;
        this.redirectUri = env.REDIRECT_URI;
        this.hubId = env.HUB_ID;

        this.accessToken = null;
        this.refreshToken = null;

        // Configure Axios instance
        this.axiosInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor
        this.setupInterceptors();
    }

    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                if (this.accessToken) {
                    config.headers.Authorization = `Bearer ${this.accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401 && this.refreshToken) {
                    try {
                        await this.refreshAccessToken();
                        const config = error.config;
                        config.headers.Authorization = `Bearer ${this.accessToken}`;
                        return this.axiosInstance.request(config);
                    } catch (refreshError) {
                        return Promise.reject(refreshError);
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
        this.startPolling();
    }

    async refreshAccessToken() {
        try {
            const response = await axios.post(this.tokenEndpoint, null, {
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
            const response = await this.axiosInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get match details: ${error.message}`);
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

    async sendChatMessage(playerId, message) {
        try {
            const response = await this.axiosInstance.post('/chat/messages', {
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

    async getPlayerElo(playerId) {
        try {
            const response = await this.axiosInstance.get(`/players/${playerId}`);
            return response.data.games?.csgo?.faceit_elo || 0;
        } catch (error) {
            throw new Error(`Failed to get player elo: ${error.message}`);
        }
    }

    startPolling() {
        this.previousMatchStates = {};

        setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);
                for (const match of activeMatches) {
                    const prevState = this.previousMatchStates[match.id];
                    if (prevState && prevState !== match.state) {
                        this.emit('matchStateChange', match);
                    }
                    this.previousMatchStates[match.id] = match.state;
                }
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
            const response = await this.axiosInstance.get(`/hubs/${hubId}/matches`, {
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
