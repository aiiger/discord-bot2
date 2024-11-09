import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { env } from 'node:process';
import logger from './logger.js';

dotenv.config();

class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
        this.clientId = env.CLIENT_ID;
        this.clientSecret = env.CLIENT_SECRET;
        this.redirectUri = env.REDIRECT_URI;
        this.hubId = env.HUB_ID;
        this.apiKey = env.FACEIT_API_KEY;

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
                        logger.error('Failed to refresh token:', refreshError);
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
            logger.error('Client credentials authentication failed:', error.message);
            throw error;
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
            logger.error('Failed to refresh access token:', error.message);
            throw error;
        }
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
            logger.error(`Failed to get hub matches for hub ${hubId}:`, error.message);
            throw new Error(`Failed to get hub matches: ${error.message}`);
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
                logger.error('Polling error:', error);
            }
        }, 60000);
    }

    onMatchStateChange(callback) {
        this.on('matchStateChange', callback);
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'openid profile email',
            state: state
        });

        return `https://accounts.faceit.com/oauth/authorize?${params.toString()}`;
    }
}

export { FaceitJS };
