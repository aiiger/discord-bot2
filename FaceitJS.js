// FaceitJS.js
import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import crypto from 'crypto';
import getHeaders from './utils/headers.js';

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
        const requiredEnv = ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI', 'HUB_ID', 'FACEIT_API_KEY'];
        requiredEnv.forEach((envVar) => {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        });

        this.accessToken = null;
        this.refreshToken = null;
        this.lastMessageTimestamps = new Map();

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
            ...getHeaders(this.apiKey)
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
        logger.info('FaceitJS initialized successfully');
    }

    setupInterceptors() {
        // Chat API instance interceptors
        this.chatApiInstance.interceptors.request.use(
            (config) => {
                if (this.accessToken) {
                    config.headers.Authorization = `Bearer ${this.accessToken}`;
                } else if (this.apiKey) {
                    config.headers.Authorization = `Bearer ${this.apiKey}`;
                }

                if (config.method === 'post' && config.url.includes('/messages')) {
                    logger.info(`[CHAT REQUEST] Sending message to ${config.url}`);
                    logger.info(`[CHAT CONTENT] ${JSON.stringify(config.data)}`);
                }
                return config;
            },
            (error) => {
                logger.error('Request interceptor error:', error);
                return Promise.reject(error);
            }
        );

        // Common response interceptor for handling 401s
        const responseInterceptor = async (error) => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
                originalRequest._retry = true;
                try {
                    logger.info('Access token expired, attempting refresh');
                    await this.refreshAccessToken();
                    originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
                    return axios(originalRequest);
                } catch (refreshError) {
                    logger.error('Token refresh failed:', refreshError);
                    throw refreshError;
                }
            }

            return Promise.reject(error);
        };

        this.chatApiInstance.interceptors.response.use(
            (response) => {
                if (response.config.method === 'post' && response.config.url.includes('/messages')) {
                    logger.info(`[CHAT SUCCESS] Message sent successfully to ${response.config.url}`);
                }
                return response;
            },
            responseInterceptor
        );
    }

    // PKCE Helper Methods
    generateCodeVerifier() {
        const verifier = crypto.randomBytes(32)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 128);
        logger.info('Generated code verifier');
        return verifier;
    }

    generateCodeChallenge(verifier) {
        const challenge = crypto.createHash('sha256')
            .update(verifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        logger.info('Generated code challenge');
        return challenge;
    }

    // OAuth2 PKCE Methods
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

        const url = `https://accounts.faceit.com/authorize?${params.toString()}`;
        logger.info(`Generated authorization URL: ${url}`);

        return {
            url,
            codeVerifier
        };
    }

    async exchangeCodeForToken(code, codeVerifier) {
        try {
            logger.info('Attempting to exchange authorization code for tokens');
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            });

            const response = await this.oauthInstance.post('/oauth/token', params);
            logger.info('Successfully exchanged code for tokens');

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            return response.data;
        } catch (error) {
            logger.error('Failed to exchange code for token:', error);
            throw error;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            logger.info('Attempting to refresh access token');
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: this.clientId,
                client_secret: this.clientSecret
            });

            const response = await this.oauthInstance.post('/oauth/token', params);
            logger.info('Successfully refreshed access token');

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            return response.data;
        } catch (error) {
            logger.error('Failed to refresh token:', error);
            throw error;
        }
    }

    // Hub Methods
    async getHubDetails(hubId = this.hubId, expanded = []) {
        try {
            const params = new URLSearchParams();
            if (expanded.length > 0) {
                params.append('expanded', expanded.join(','));
            }

            logger.info(`[HUB] Getting details for hub ${hubId}`);
            const response = await this.dataApiInstance.get(`/hubs/${hubId}?${params.toString()}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get hub details for ${hubId}:`, error);
            throw error;
        }
    }

    async getHubMatches(hubId = this.hubId, type = 'ongoing', offset = 0, limit = 20) {
        try {
            const params = new URLSearchParams({
                type,
                offset: offset.toString(),
                limit: limit.toString()
            });

            logger.info(`[HUB] Getting ${type} matches for hub ${hubId}`);
            const response = await this.dataApiInstance.get(`/hubs/${hubId}/matches?${params.toString()}`);
            if (response.data.items.length > 0) {
                logger.info(`[HUB] Found ${response.data.items.length} ${type} matches`);
                response.data.items.forEach(match => {
                    logger.info(`[MATCH INFO] Match ${match.match_id} is in state: ${match.state}`);
                });
            } else {
                logger.info(`[HUB] No ${type} matches found`);
            }
            return response.data.items;
        } catch (error) {
            logger.error(`Failed to get hub matches for ${hubId}:`, error);
            throw error;
        }
    }

    // Match Methods
    async getMatchDetails(matchId) {
        try {
            logger.info(`[MATCH] Getting details for match ${matchId}`);
            const response = await this.dataApiInstance.get(`/matches/${matchId}`);
            logger.info(`[MATCH] Match ${matchId} state: ${response.data.state}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get match details for ${matchId}:`, error);
            throw error;
        }
    }

    async getMatchStats(matchId) {
        try {
            logger.info(`Getting stats for match ${matchId}`);
            const response = await this.dataApiInstance.get(`/matches/${matchId}/stats`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get match stats for ${matchId}:`, error);
            throw error;
        }
    }

    async rehostMatch(matchId) {
        try {
            logger.info(`[MATCH ACTION] Attempting to rehost match ${matchId}`);
            const response = await this.dataApiInstance.post(`/matches/${matchId}/rehost`);
            logger.info(`[MATCH ACTION] Successfully rehosted match ${matchId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to rehost match ${matchId}:`, error);
            throw error;
        }
    }

    async cancelMatch(matchId) {
        try {
            logger.info(`[MATCH ACTION] Attempting to cancel match ${matchId}`);
            const response = await this.dataApiInstance.post(`/matches/${matchId}/cancel`);
            logger.info(`[MATCH ACTION] Successfully cancelled match ${matchId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to cancel match ${matchId}:`, error);
            throw error;
        }
    }

    // Chat Methods
    async getRoomDetails(roomId) {
        try {
            logger.info(`[CHAT] Getting details for room ${roomId}`);
            const response = await this.chatApiInstance.get(`/rooms/${roomId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get room details for ${roomId}:`, error);
            throw error;
        }
    }

    async getRoomMessages(roomId, before = '', limit = 50) {
        try {
            const params = new URLSearchParams();
            if (before) params.append('before', before);
            if (limit) params.append('limit', limit.toString());

            logger.info(`[CHAT] Getting messages for room ${roomId}`);
            const response = await this.chatApiInstance.get(`/rooms/${roomId}/messages?${params.toString()}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get room messages for ${roomId}:`, error);
            throw error;
        }
    }

    async sendRoomMessage(roomId, message) {
        try {
            logger.info(`[CHAT SEND] Sending message to room ${roomId}: "${message}"`);

            // Send message using the correct endpoint format and body parameter
            const response = await this.chatApiInstance.post(`/rooms/${roomId}/messages`, {
                body: message
            });

            logger.info(`[CHAT SUCCESS] Message sent to room ${roomId}`);
            return response.data;
        } catch (error) {
            logger.error(`[CHAT ERROR] Failed to send message to room ${roomId}:`, error);
            throw error;
        }
    }

    // Event handling for match state changes
    startPolling() {
        this.previousMatchStates = {};
        logger.info('[POLLING] Starting match state polling');

        // Poll every 15 seconds
        setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);
                activeMatches.forEach(match => {
                    const prevState = this.previousMatchStates[match.id];
                    if (!prevState) {
                        logger.info(`[MATCH NEW] Found new match ${match.id} in state: ${match.state}`);
                    } else if (prevState !== match.state) {
                        logger.info(`[MATCH STATE] Match ${match.id} state changed from ${prevState} to ${match.state}`);
                        this.emit('matchStateChange', match);
                    }
                    this.previousMatchStates[match.id] = match.state;

                    // Poll chat messages for this match
                    if (match.chat_room_id) {
                        this.pollRoomMessages(match.chat_room_id);
                    }
                });
            } catch (error) {
                logger.error('[POLLING ERROR] Failed to poll matches:', error);
            }
        }, 15000);
    }

    // Poll chat messages for a room
    async pollRoomMessages(roomId) {
        try {
            const lastTimestamp = this.lastMessageTimestamps.get(roomId) || '';
            const messages = await this.getRoomMessages(roomId, lastTimestamp);

            if (messages.messages && messages.messages.length > 0) {
                // Update last message timestamp
                this.lastMessageTimestamps.set(roomId, messages.messages[0].timestamp);

                // Process new messages
                messages.messages.reverse().forEach(message => {
                    if (message.text.startsWith('!')) {
                        logger.info(`[CHAT COMMAND] Room ${roomId}: ${message.text} from ${message.user_id}`);
                        this.emit('roomMessage', message, roomId);
                    }
                });
            }
        } catch (error) {
            logger.error(`[CHAT ERROR] Failed to poll messages for room ${roomId}:`, error);
        }
    }

    onMatchStateChange(callback) {
        this.on('matchStateChange', callback);
        logger.info('[EVENT] Registered match state change callback');
    }

    onRoomMessage(callback) {
        this.on('roomMessage', callback);
        logger.info('[EVENT] Registered room message callback');
    }
}
