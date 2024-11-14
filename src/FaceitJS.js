const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

class FaceitJS {
    constructor(app) {
        this.serverApiKey = process.env.FACEIT_API_KEY;
        this.clientId = process.env.FACEIT_CLIENT_API_KEY;
        this.clientSecret = process.env.FACEIT_CLIENT_SECRET;
        this.hubId = process.env.HUB_ID;

        if (!this.clientId) {
            console.error('[FACEIT] Client ID not found in environment variables');
        } else {
            console.log('[FACEIT] Client ID loaded successfully');
        }

        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.setupAxiosInstances();
    }

    setupAxiosInstances() {
        console.log('[FACEIT] Setting up API instances');

        // Create axios instance for Data API requests
        this.api = axios.create({
            baseURL: 'https://open.faceit.com/data/v4',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.serverApiKey}`
            }
        });

        // Create axios instance for Chat API requests
        this.chatApi = axios.create({
            baseURL: 'https://open.faceit.com/chat/v1',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
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

        this.api.interceptors.response.use(response => response, errorHandler);
        this.chatApi.interceptors.response.use(response => response, errorHandler);
    }

    async getActiveMatches() {
        try {
            console.log('[MATCHES] Fetching active matches');
            console.log('[MATCHES] Using Hub ID:', this.hubId);

            // Get all matches
            const response = await this.api.get(`/hubs/${this.hubId}/matches?offset=0&limit=20`);
            const matches = response.data.items || [];

            // Filter matches to only include those in map veto phase
            const newMatches = matches.filter(match => {
                const status = match.status || match.state;
                return status !== 'CANCELLED' && status !== 'FINISHED' && status !== 'ONGOING';
            });

            // Get ongoing matches separately
            const ongoingResponse = await this.api.get(`/hubs/${this.hubId}/matches?type=ongoing&offset=0&limit=20`);
            const ongoingMatches = ongoingResponse.data.items || [];

            const allMatches = [...newMatches, ...ongoingMatches];

            console.log(`[MATCHES] Retrieved ${allMatches.length} active matches (${newMatches.length} new, ${ongoingMatches.length} ongoing)`);

            // Log each match's details
            allMatches.forEach(match => {
                const status = match.status || match.state;
                console.log(`[MATCH ${match.match_id}] Status: ${status}, Teams: ${match.teams?.faction1?.name || 'TBD'} vs ${match.teams?.faction2?.name || 'TBD'}`);
            });

            return allMatches;
        } catch (error) {
            console.error('[MATCHES] Error fetching matches:', error.message);
            if (error.response?.data) {
                console.error('[MATCHES] Response data:', error.response.data);
            }
            throw error;
        }
    }

    async getMatchDetails(matchId) {
        try {
            const response = await this.api.get(`/matches/${matchId}`);
            return response.data;
        } catch (error) {
            console.error(`[MATCH] Error getting match details for ${matchId}:`, error.message);
            throw error;
        }
    }

    async handleRehostVote(matchId, playerId) {
        try {
            // Get match details
            const match = await this.getMatchDetails(matchId);

            // Calculate required votes (6/10 players)
            const totalPlayers = match.teams.faction1.roster.length + match.teams.faction2.roster.length;
            const requiredVotes = Math.ceil(totalPlayers * 0.6);

            // For now, just show the requirement
            const message = `Rehost requires ${requiredVotes} out of ${totalPlayers} players to vote. Type !rehost to vote.`;

            return {
                success: true,
                message: message
            };
        } catch (error) {
            console.error(`[REHOST] Error handling rehost vote for match ${matchId}:`, error.message);
            throw error;
        }
    }

    async handleCancelVote(matchId, playerId) {
        try {
            // Get match details
            const match = await this.getMatchDetails(matchId);

            // Calculate elo differential
            const team1Avg = match.teams.faction1.roster.reduce((sum, player) => sum + player.elo, 0) / match.teams.faction1.roster.length;
            const team2Avg = match.teams.faction2.roster.reduce((sum, player) => sum + player.elo, 0) / match.teams.faction2.roster.length;
            const eloDiff = Math.abs(team1Avg - team2Avg);

            // Check if elo differential is high enough
            if (eloDiff >= 70) {
                return {
                    success: true,
                    passed: true,
                    message: `Match cancellation approved. Elo differential: ${Math.round(eloDiff)}`
                };
            } else {
                return {
                    success: true,
                    passed: false,
                    message: `Cannot cancel match. Elo differential (${Math.round(eloDiff)}) is below required threshold (70)`
                };
            }
        } catch (error) {
            console.error(`[CANCEL] Error handling cancel vote for match ${matchId}:`, error.message);
            throw error;
        }
    }

    async sendChatMessage(matchId, message) {
        try {
            console.log(`[CHAT] Sending message to match ${matchId}`);

            // Get match details
            const matchResponse = await this.api.get(`/matches/${matchId}`);
            const match = matchResponse.data;
            console.log(`[CHAT] Got match details for ${matchId}`);

            // Try to get the chat room ID from match details
            const roomId = match.chat_room_id || `match-${matchId}`;
            console.log(`[CHAT] Using room ID: ${roomId}`);

            // First try to get room details to verify access
            try {
                const roomResponse = await axios({
                    method: 'get',
                    url: `https://open.faceit.com/chat/v1/rooms/${roomId}`,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': this.serverApiKey
                    }
                });
                console.log(`[CHAT] Got room details:`, roomResponse.data);
            } catch (error) {
                console.log(`[CHAT] Could not get room details:`, error.message);
            }

            // Send message using server API key
            const response = await axios({
                method: 'post',
                url: `https://open.faceit.com/chat/v1/rooms/${roomId}/messages`,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': this.serverApiKey
                },
                data: {
                    body: message.replace(/^"|"$/g, '') // Remove any surrounding quotes
                }
            });

            console.log(`[CHAT] Message sent successfully to match ${matchId}`);
            return { success: true, data: response.data };
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
