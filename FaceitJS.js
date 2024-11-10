import { EventEmitter } from 'events';
import axios from 'axios';

class FaceitJS extends EventEmitter {
    constructor(apiKeyServerSide, apiKeyClientSide) {
        super();
        this.apiKeyServer = apiKeyServerSide;
        this.apiKeyClient = apiKeyClientSide;
        this.accessToken = this.apiKeyServer; // Use server API key as access token
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.apiBase = 'https://api.faceit.com';
        this.chatApiInstance = null;
        this.apiInstance = null;
        this.headers = {
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json'
            },
        };

        // Initialize chat API instance
        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });

        // Initialize main API instance
        this.apiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });

        // Start monitoring matches
        this.monitorMatches();
    }

    // Monitor matches in the hub
    async monitorMatches() {
        const hubId = process.env.HUB_ID;
        if (!hubId) {
            throw new Error('HUB_ID not configured');
        }

        // Keep track of match states
        const matchStates = new Map();

        // Poll for matches every 30 seconds
        setInterval(async () => {
            try {
                // Get all ongoing matches in the hub
                const response = await this.apiInstance.get(`/hubs/${hubId}/matches`, {
                    params: {
                        type: 'ongoing',
                        offset: 0,
                        limit: 20
                    }
                });

                const matches = response.data.items || [];

                // Check each match
                for (const match of matches) {
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
                    const matchExists = matches.some(m => m.match_id === matchId);
                    if (!matchExists) {
                        matchStates.delete(matchId);
                    }
                }
            } catch (error) {
                console.error('Error monitoring matches:', error);
                if (error.response) {
                    console.error('Response status:', error.response.status);
                    console.error('Response data:', error.response.data);
                }
            }
        }, 30000);
    }

    // Getter and setter methods
    getApiKeyServer() {
        return this.apiKeyServer;
    }

    setApiKeyServer(apiKeyServerSide) {
        this.apiKeyServer = apiKeyServerSide;
        this.accessToken = apiKeyServerSide;
        this.headers.headers.Authorization = `Bearer ${this.apiKeyServer}`;

        // Update API instances with new token
        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });

        this.apiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKeyServer}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        });
    }

    getApiKeyClient() {
        return this.apiKeyClient;
    }

    setApiKeyClient(apiKeyClientSide) {
        this.apiKeyClient = apiKeyClientSide;
    }

    getHeader() {
        return this.headers;
    }

    async sendRoomMessage(roomId, message) {
        try {
            console.log(`Attempting to send message to room ${roomId}: ${message}`);
            console.log('Request URL:', `${this.chatApiBase}/rooms/${roomId}/messages`);

            // Check for access token
            if (!this.apiKeyServer) {
                throw new Error('No access token available for chat API request');
            }

            // Send message with updated structure
            const response = await this.chatApiInstance.post(`/rooms/${roomId}/messages`, {
                content: {
                    text: message,
                    type: "text",
                    metadata: {}
                },
                timestamp: new Date().toISOString()
            });

            console.log(`Successfully sent message to room ${roomId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to send room message to ${roomId}:`, error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                console.error('Response headers:', error.response.headers);
                console.error('Request URL:', error.config.url);
                console.error('Request method:', error.config.method);
                console.error('Request headers:', error.config.headers);
                console.error('Request data:', error.config.data);

                // Try to get room details to verify room exists
                try {
                    const roomDetails = await this.getRoomDetails(roomId);
                    console.error('Room exists:', roomDetails);
                } catch (roomError) {
                    console.error('Failed to get room details:', roomError);
                }
            } else if (error.request) {
                console.error('No response received:', error.request);
            } else {
                console.error('Error setting up request:', error.message);
            }
            throw error;
        }
    }

    async getRoomDetails(roomId) {
        try {
            const response = await this.chatApiInstance.get(`/rooms/${roomId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to get room details for ${roomId}:`, error);
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.apiInstance.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to get match details for ${matchId}:`, error);
            throw error;
        }
    }
}

export default FaceitJS;
