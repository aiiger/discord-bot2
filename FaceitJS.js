import { EventEmitter } from 'events';
import axios from 'axios';
import logger from './logger.js';

class FaceitJS extends EventEmitter {
    constructor(apiKeyServerSide, apiKeyClientSide) {
        super();
        this.apiKeyServer = apiKeyServerSide;
        this.apiKeyClient = apiKeyClientSide;
        this.accessToken = this.apiKeyServer;
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.apiBase = 'https://open.faceit.com/data/v4';  // FACEIT Open API v4 endpoint

        // Initialize chat API instance
        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });

        // Initialize main API instance with v4 headers
        this.apiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,  // Changed to use Bearer token
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300; // default
            }
        });

        // Add response interceptor for better error handling
        this.apiInstance.interceptors.response.use(
            response => response,
            error => {
                if (error.response) {
                    logger.error('API Error Response:', {
                        status: error.response.status,
                        data: error.response.data,
                        headers: error.response.headers,
                        url: error.config.url,
                        method: error.config.method
                    });
                } else if (error.request) {
                    logger.error('API Request Error:', {
                        request: error.request,
                        message: error.message
                    });
                } else {
                    logger.error('API Error:', error.message);
                }
                return Promise.reject(error);
            }
        );
    }

    async validateAccess() {
        try {
            // Test API access with a simple endpoint
            const response = await this.apiInstance.get('/games');
            logger.info('API access validated successfully');
            return true;
        } catch (error) {
            logger.error('API access validation failed:', error);
            return false;
        }
    }

    async getHubDetails(hubId) {
        try {
            const response = await this.apiInstance.get(`/hubs/${hubId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get hub details for ${hubId}:`, error);
            throw error;
        }
    }

    async getHubMatches(hubId, options = { type: 'ongoing', offset: 0, limit: 20 }) {
        try {
            const response = await this.apiInstance.get(`/hubs/${hubId}/matches`, {
                params: options
            });
            return response.data;
        } catch (error) {
            logger.error(`Failed to get hub matches for ${hubId}:`, error);
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.apiInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get match details for ${matchId}:`, error);
            throw error;
        }
    }

    async getRoomDetails(roomId) {
        try {
            const response = await this.chatApiInstance.get(`/rooms/${roomId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to get room details for ${roomId}:`, error);
            throw error;
        }
    }

    async sendRoomMessage(roomId, message) {
        try {
            logger.info(`Attempting to send message to room ${roomId}: ${message}`);

            if (!this.apiKeyServer) {
                throw new Error('No access token available for chat API request');
            }

            const response = await this.chatApiInstance.post(`/rooms/${roomId}/messages`, {
                content: {
                    text: message,
                    type: "text",
                    metadata: {}
                },
                timestamp: new Date().toISOString()
            });

            logger.info(`Successfully sent message to room ${roomId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to send room message to ${roomId}:`, error);
            if (error.response) {
                logger.error('Response details:', {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers,
                    url: error.config.url,
                    method: error.config.method,
                    requestData: error.config.data
                });

                try {
                    const roomDetails = await this.getRoomDetails(roomId);
                    logger.info('Room exists:', roomDetails);
                } catch (roomError) {
                    logger.error('Failed to get room details:', roomError);
                }
            }
            throw error;
        }
    }

    // Start monitoring matches in the hub
    async startMonitoring(hubId) {
        try {
            // Validate hub access first
            const hubDetails = await this.getHubDetails(hubId);
            logger.info(`Successfully connected to hub: ${hubDetails.name}`);

            // Keep track of match states
            const matchStates = new Map();

            // Poll for matches every 30 seconds
            const interval = setInterval(async () => {
                try {
                    const matches = await this.getHubMatches(hubId);
                    logger.debug(`Found ${matches.items.length} matches in hub`);

                    // Process each match
                    for (const match of matches.items) {
                        const previousState = matchStates.get(match.match_id);
                        const currentState = match.status;

                        // If state changed or new match
                        if (previousState !== currentState) {
                            this.emit('matchStateChange', {
                                id: match.match_id,
                                previousState: previousState || 'NEW',
                                state: currentState,
                                details: match
                            });
                            matchStates.set(match.match_id, currentState);
                        }
                    }

                    // Clean up old matches
                    for (const [matchId, state] of matchStates) {
                        const matchExists = matches.items.some(m => m.match_id === matchId);
                        if (!matchExists) {
                            matchStates.delete(matchId);
                            logger.info(`Removed match ${matchId} from tracking`);
                        }
                    }
                } catch (error) {
                    logger.error('Error polling matches:', error);
                }
            }, 30000);

            // Return the interval ID so it can be cleared if needed
            return interval;
        } catch (error) {
            logger.error('Failed to start monitoring:', error);
            throw error;
        }
    }
}

export default FaceitJS;
