// FaceitJS.js
import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import crypto from 'crypto';
import getHeaders, { getChatHeaders } from './utils/headers.js';

dotenv.config();

// Initialize logger
const logger = {
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO: ${message}`, ...args);
    },
    error: (message, error) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`);
        if (error?.response?.data) {
            console.error('Response data:', error.response.data);
        }
        if (error?.response?.status) {
            console.error('Status code:', error.response.status);
        }
        if (error?.config?.url) {
            console.error('Request URL:', error.config.url);
        }
        if (error?.config?.headers) {
            const sanitizedHeaders = { ...error.config.headers };
            if (sanitizedHeaders.Authorization) {
                sanitizedHeaders.Authorization = 'Bearer [REDACTED]';
            }
            console.error('Request headers:', sanitizedHeaders);
        }
        if (error?.config?.data) {
            console.error('Request data:', error.config.data);
        }
        console.error('Full error:', error);
    }
};

export class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.authBase = 'https://api.faceit.com/auth/v1';
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;

        // Validate environment variables
        const requiredEnv = ['CLIENT_ID', 'CLIENT_SECRET', 'HUB_ID', 'FACEIT_API_KEY'];
        requiredEnv.forEach((envVar) => {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        });

        this.accessToken = null;
        this.refreshToken = null;
        this.lastMessageTimestamps = new Map();
        this.pollingInterval = null;
        this.previousMatchStates = new Map();

        // Create Axios instances for different API endpoints
        this.oauthInstance = axios.create({
            baseURL: this.authBase,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Data API instance with API key auth
        this.dataApiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Chat API instance with OAuth token auth
        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase
        });

        this.setupInterceptors();
        logger.info('FaceitJS initialized successfully');
    }

    setupInterceptors() {
        // Add access token to chat API requests
        this.chatApiInstance.interceptors.request.use((config) => {
            if (!this.accessToken) {
                throw new Error('No access token available');
            }
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };
            return config;
        }, (error) => {
            return Promise.reject(error);
        });

        // Add error handling interceptor
        this.chatApiInstance.interceptors.response.use(
            response => response,
            async error => {
                if (error.response?.status === 401) {
                    try {
                        await this.refreshAccessToken();
                        // Retry the original request with new token
                        const originalRequest = error.config;
                        originalRequest.headers['Authorization'] = `Bearer ${this.accessToken}`;
                        return this.chatApiInstance(originalRequest);
                    } catch (refreshError) {
                        logger.error('[AUTH ERROR] Failed to refresh token:', refreshError);
                        this.accessToken = null;
                        this.refreshToken = null;
                        throw refreshError;
                    }
                }
                throw error;
            }
        );
    }

    // Generate PKCE code verifier and challenge
    generatePKCE() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256')
            .update(verifier)
            .digest('base64url');
        return { verifier, challenge };
    }

    // Get authorization URL for OAuth2 PKCE flow
    async getAuthorizationUrl(state, customRedirectUri = null) {
        try {
            const { verifier, challenge } = this.generatePKCE();

            const params = new URLSearchParams({
                response_type: 'code',
                client_id: this.clientId,
                redirect_uri: customRedirectUri || this.redirectUri,
                scope: 'public openid profile email chat chat:write chat:read',
                state: state,
                code_challenge: challenge,
                code_challenge_method: 'S256'
            });

            const url = `${this.authBase}/oauth/authorize?${params.toString()}`;
            logger.info('Generated authorization URL with PKCE');

            return { url, codeVerifier: verifier };
        } catch (error) {
            logger.error('Failed to generate authorization URL:', error);
            throw error;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: this.clientId,
                client_secret: this.clientSecret
            });

            const response = await this.oauthInstance.post('/oauth/token', params);

            if (!response.data.access_token) {
                throw new Error('No access token in refresh response');
            }

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            logger.info('Successfully refreshed access token');
            return response.data;
        } catch (error) {
            logger.error('Failed to refresh access token:', error);
            this.accessToken = null;
            this.refreshToken = null;
            throw error;
        }
    }

    async exchangeCodeForToken(code, codeVerifier, customRedirectUri = null) {
        try {
            logger.info('Attempting to exchange authorization code for tokens');
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: customRedirectUri || this.redirectUri,
                code_verifier: codeVerifier
            });

            const response = await this.oauthInstance.post('/oauth/token', params);

            if (!response.data.access_token) {
                throw new Error('No access token in exchange response');
            }

            logger.info('Successfully exchanged code for tokens');

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            // Start polling after successful authentication
            this.startPolling();

            return response.data;
        } catch (error) {
            logger.error('Failed to exchange code for token:', error);
            throw error;
        }
    }

    async getHubMatches(hubId) {
        try {
            const response = await this.dataApiInstance.get(`/hubs/${hubId}/matches`);
            return response.data.items || [];
        } catch (error) {
            logger.error('[HUB ERROR] Failed to get hub matches:', error);
            return [];
        }
    }

    async pollRoomMessages(roomId) {
        if (!this.accessToken) {
            logger.error('[CHAT ERROR] No access token available for polling messages');
            return;
        }

        try {
            const lastTimestamp = this.lastMessageTimestamps.get(roomId) || 0;
            const response = await this.chatApiInstance.get(`/rooms/${roomId}/messages`, {
                params: { timestamp_from: lastTimestamp }
            });

            if (response.data && Array.isArray(response.data.messages)) {
                const messages = response.data.messages;
                if (messages.length > 0) {
                    const latestTimestamp = Math.max(...messages.map(m => m.timestamp));
                    this.lastMessageTimestamps.set(roomId, latestTimestamp);
                    messages.forEach(message => {
                        this.emit('chatMessage', message);
                    });
                }
            }
        } catch (error) {
            if (error.message === 'No access token available') {
                logger.error('[CHAT ERROR] No access token available for polling messages');
            } else {
                logger.error('[CHAT ERROR] Failed to poll messages:', error);
            }
        }
    }

    startPolling() {
        if (!this.accessToken) {
            logger.error('[POLLING ERROR] Cannot start polling without access token');
            return;
        }

        // Clear any existing polling interval
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        logger.info('[POLLING] Starting match state polling');

        // Poll every 15 seconds
        this.pollingInterval = setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);

                if (!Array.isArray(activeMatches)) {
                    logger.error('[POLLING ERROR] Invalid matches data received');
                    return;
                }

                logger.info(`[HUB] Found ${activeMatches.length} ongoing matches`);

                activeMatches.forEach(match => {
                    if (!match || !match.match_id) {
                        logger.error('[POLLING ERROR] Invalid match data:', match);
                        return;
                    }

                    const matchId = match.match_id;
                    const currentState = match.state || 'UNKNOWN';
                    const prevState = this.previousMatchStates.get(matchId);

                    logger.info(`[MATCH INFO] Match ${matchId} is in state: ${currentState}`);

                    if (!prevState) {
                        logger.info(`[MATCH NEW] Found new match ${matchId} in state: ${currentState}`);
                        this.emit('newMatch', match);
                    } else if (prevState !== currentState) {
                        logger.info(`[MATCH STATE] Match ${matchId} state changed from ${prevState} to ${currentState}`);
                        this.emit('matchStateChange', match);
                    }

                    this.previousMatchStates.set(matchId, currentState);

                    // Only poll chat messages if we have an access token and chat room ID
                    if (this.accessToken && match.chat_room_id) {
                        this.pollRoomMessages(match.chat_room_id).catch(error => {
                            logger.error(`[CHAT ERROR] Failed to poll messages for room ${match.chat_room_id}:`, error);
                        });
                    }
                });

                // Clean up old matches
                const currentMatchIds = new Set(activeMatches.map(m => m.match_id));
                for (const [matchId] of this.previousMatchStates) {
                    if (!currentMatchIds.has(matchId)) {
                        this.previousMatchStates.delete(matchId);
                        logger.info(`[MATCH REMOVED] Match ${matchId} is no longer active`);
                    }
                }
            } catch (error) {
                logger.error('[POLLING ERROR] Failed to poll matches:', error);
            }
        }, 15000);
    }
}
