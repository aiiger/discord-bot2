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
    },
    debug: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] DEBUG: ${message}`);
        if (data) {
            console.log('Debug data:', JSON.stringify(data, null, 2));
        }
    }
};

export class FaceitJS extends EventEmitter {
    constructor(accessToken = null) {
        super();
        // Data API endpoints
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.matchesEndpoint = '/hubs/{hubId}/matches';
        this.matchDetailsEndpoint = '/matches/{matchId}';

        // Chat API endpoints
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.chatMessagesEndpoint = '/rooms/{roomId}/messages';

        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;
        this.accessToken = accessToken;

        // Validate environment variables
        if (!process.env.HUB_ID || !process.env.FACEIT_API_KEY) {
            throw new Error('Missing required environment variables: HUB_ID and FACEIT_API_KEY are required');
        }

        logger.debug('Initializing with config:', {
            hubId: this.hubId,
            hasApiKey: !!this.apiKey,
            hasAccessToken: !!this.accessToken
        });

        this.lastMessageTimestamps = new Map();
        this.pollingInterval = null;
        this.previousMatchStates = new Map();

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
                'Authorization': `Bearer ${this.accessToken}`
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
        logger.debug('New access token status:', { hasToken: !!token });
    }

    async getHubMatches(hubId) {
        try {
            const endpoint = this.matchesEndpoint.replace('{hubId}', hubId);
            logger.debug('Fetching hub matches:', { endpoint, hubId });

            const response = await this.dataApiInstance.get(endpoint);
            logger.debug('Hub matches response:', {
                status: response.status,
                matchCount: response.data?.items?.length || 0
            });

            return response.data.items || [];
        } catch (error) {
            logger.error('[HUB ERROR] Failed to get hub matches:', error);
            return [];
        }
    }

    async getMatchDetails(matchId) {
        try {
            const endpoint = this.matchDetailsEndpoint.replace('{matchId}', matchId);
            logger.debug('Fetching match details:', { endpoint, matchId });

            const response = await this.dataApiInstance.get(endpoint);
            logger.debug('Match details response:', {
                status: response.status,
                matchState: response.data?.state,
                hasRoomId: !!response.data?.chat_room_id
            });

            return response.data;
        } catch (error) {
            logger.error('[MATCH ERROR] Failed to get match details:', error);
            return null;
        }
    }

    async sendChatMessage(roomId, message) {
        try {
            const endpoint = this.chatMessagesEndpoint.replace('{roomId}', roomId);
            logger.debug('Sending chat message:', { roomId, message });

            await this.chatApiInstance.post(endpoint, { body: message });
            logger.info(`[CHAT] Message sent to room ${roomId}: ${message}`);
            return true;
        } catch (error) {
            logger.error('[CHAT ERROR] Failed to send message:', error);
            return false;
        }
    }

    async pollRoomMessages(roomId) {
        if (!this.accessToken) {
            logger.error('[CHAT ERROR] No access token available for polling messages');
            return;
        }

        try {
            const lastTimestamp = this.lastMessageTimestamps.get(roomId) || 0;
            const endpoint = this.chatMessagesEndpoint.replace('{roomId}', roomId);
            logger.debug('Polling room messages:', { roomId, lastTimestamp });

            const response = await this.chatApiInstance.get(endpoint, {
                params: { timestamp_from: lastTimestamp }
            });

            if (response.data && Array.isArray(response.data.messages)) {
                const messages = response.data.messages;
                logger.debug('Room messages received:', {
                    roomId,
                    messageCount: messages.length
                });

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
        logger.debug('Polling configuration:', {
            hubId: this.hubId,
            hasAccessToken: !!this.accessToken,
            interval: '15 seconds'
        });

        // Poll every 15 seconds
        this.pollingInterval = setInterval(async () => {
            try {
                const activeMatches = await this.getHubMatches(this.hubId);

                if (!Array.isArray(activeMatches)) {
                    logger.error('[POLLING ERROR] Invalid matches data received');
                    return;
                }

                logger.info(`[HUB] Found ${activeMatches.length} ongoing matches`);
                logger.debug('Active matches:', activeMatches.map(m => ({
                    matchId: m.match_id,
                    state: m.state,
                    hasRoomId: !!m.chat_room_id
                })));

                for (const match of activeMatches) {
                    if (!match || !match.match_id) {
                        logger.error('[POLLING ERROR] Invalid match data:', match);
                        continue;
                    }

                    const matchId = match.match_id;
                    const matchDetails = await this.getMatchDetails(matchId);
                    if (!matchDetails) continue;

                    const currentState = matchDetails.state || 'UNKNOWN';
                    const prevState = this.previousMatchStates.get(matchId);

                    logger.info(`[MATCH INFO] Match ${matchId} is in state: ${currentState}`);
                    logger.debug('Match details:', {
                        matchId,
                        currentState,
                        previousState: prevState,
                        hasRoomId: !!matchDetails.chat_room_id,
                        teams: matchDetails.teams ? {
                            faction1Count: matchDetails.teams.faction1?.roster?.length,
                            faction2Count: matchDetails.teams.faction2?.roster?.length
                        } : null
                    });

                    if (!prevState) {
                        logger.info(`[MATCH NEW] Found new match ${matchId} in state: ${currentState}`);
                        this.emit('newMatch', matchDetails);
                    } else if (prevState !== currentState) {
                        logger.info(`[MATCH STATE] Match ${matchId} state changed from ${prevState} to ${currentState}`);
                        this.emit('matchStateChange', matchDetails);
                    }

                    this.previousMatchStates.set(matchId, currentState);

                    // Only poll chat messages if we have an access token and chat room ID
                    if (this.accessToken && matchDetails.chat_room_id) {
                        await this.pollRoomMessages(matchDetails.chat_room_id).catch(error => {
                            logger.error(`[CHAT ERROR] Failed to poll messages for room ${matchDetails.chat_room_id}:`, error);
                        });
                    }
                }

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
