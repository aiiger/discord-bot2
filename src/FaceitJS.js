const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

class FaceitJS {
    constructor() {
        this.apiKey = process.env.FACEIT_API_KEY;
        this.hubId = process.env.HUB_ID;
        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.setupAxiosInstances();
    }

    setupAxiosInstances() {
        console.log('[FACEIT] Setting up API instances');

        // Create axios instance for Data API requests
        this.dataApi = axios.create({
            baseURL: 'https://open.faceit.com/data/v4',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });

        // Add response interceptor for error handling
        const errorHandler = error => {
            console.error('[FACEIT] API Error:', error.message);
            if (error.response) {
                console.error('[FACEIT] Response status:', error.response.status);
                console.error('[FACEIT] Response data:', error.response.data);
            }
            throw error;
        };

        this.dataApi.interceptors.response.use(response => response, errorHandler);
    }

    async getActiveMatches() {
        try {
            console.log('[MATCHES] Fetching active matches');
            console.log('[MATCHES] Using Hub ID:', this.hubId);

            const response = await this.dataApi.get(`/hubs/${this.hubId}/matches?type=ongoing&offset=0&limit=20`);
            const matches = response.data.items || [];
            console.log(`[MATCHES] Retrieved ${matches.length} matches`);
            return matches;
        } catch (error) {
            console.error('[MATCHES] Error fetching matches:', error.message);
            if (error.response?.data) {
                console.error('[MATCHES] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async sendChatMessage(matchId, message) {
        try {
            console.log(`[CHAT] Sending message to match ${matchId}`);

            // Get match details first to get the chat room ID
            const matchResponse = await this.dataApi.get(`/matches/${matchId}`);
            const chatRoomId = matchResponse.data.chat_room_id;
            console.log(`[CHAT] Got chat room ID: ${chatRoomId}`);

            // Send message to chat room using the correct endpoint and payload format
            const response = await axios.post(
                `https://open.faceit.com/chat/v1/rooms/${chatRoomId}/messages`,
                {
                    body: message
                },
                {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                }
            );
            console.log(`[CHAT] Message sent successfully to match ${matchId}`);
            return response.data;
        } catch (error) {
            console.error(`[CHAT] Error sending message to match ${matchId}:`, error.message);
            if (error.response?.data) {
                console.error('[CHAT] Response data:', error.response.data);
            }
            throw error;
        }
    }
}

module.exports = { FaceitJS };
