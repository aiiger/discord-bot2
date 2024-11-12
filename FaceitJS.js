import axios from 'axios';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

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
    constructor(accessToken = null) {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;
        this.accessToken = accessToken;

        // Validate environment variables
        if (!process.env.HUB_ID || !process.env.FACEIT_API_KEY) {
            throw new Error('Missing required environment variables: HUB_ID and FACEIT_API_KEY are required');
        }

        this.lastMessageTimestamps = new Map();
        this.pollingInterval = null;
        this.previousMatchStates = new Map();

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
                    logger.error('[AUTH ERROR] Unauthorized request:', error);
                    this.emit('unauthorized', error);
                    throw error;
                }
                throw error;
            }
        );
    }

    setAccessToken(token) {
        this.accessToken = token;
        logger.info('Access token updated');
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

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            logger.info('[POLLING] Stopped match state polling');
        }
    }
}
