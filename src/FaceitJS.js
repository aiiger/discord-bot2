const axios = require('axios');
const dotenv = require('dotenv');
const FaceitAuth = require('./auth');

dotenv.config();

class FaceitJS {
    constructor(app) {
        this.serverApiKey = process.env.FACEIT_API_KEY;
        this.clientId = process.env.FACEIT_CLIENT_API_KEY;
        this.clientSecret = process.env.FACEIT_CLIENT_SECRET;
        this.hubId = process.env.HUB_ID;
        this.redirectUri = process.env.REDIRECT_URI;
        this.auth = new FaceitAuth(this.clientId, this.clientSecret, this.redirectUri);
        this.accessToken = null;

        if (!this.clientId) {
            console.error('[FACEIT] Client ID not found in environment variables');
        } else {
            console.log('[FACEIT] Client ID loaded successfully');
        }

        console.log('[FACEIT] Initializing with Hub ID:', this.hubId);
        this.setupAxiosInstances();
        this.setupAuthRoutes(app);
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
    }

    setupAuthRoutes(app) {
        app.get('/callback', async (req, res) => {
            const { code, state } = req.query;

            // Verify state to prevent CSRF attacks
            if (!this.auth.verifyState(state)) {
                console.error('[AUTH] State mismatch');
                res.status(400).send('Invalid state parameter');
                return;
            }

            if (code) {
                try {
                    console.log('[AUTH] Received authorization code');
                    const tokenData = await this.auth.exchangeCodeForToken(code);
                    console.log('[AUTH] Successfully exchanged code for token');
                    this.accessToken = tokenData.access_token;
                    res.send('Authentication successful! You can close this window.');
                } catch (error) {
                    console.error('[AUTH] Error exchanging code for token:', error);
                    res.status(500).send('Authentication failed: ' + error.message);
                }
            } else {
                console.error('[AUTH] No code received in callback');
                res.status(400).send('No code received');
            }
        });
    }

    async getAuthorizationUrl() {
        try {
            return await this.auth.getAuthorizationUrl();
        } catch (error) {
            console.error('[AUTH] Error getting authorization URL:', error);
            throw error;
        }
    }

    async getActiveMatches() {
        try {
            console.log('[MATCHES] Fetching active matches');
            console.log('[MATCHES] Using Hub ID:', this.hubId);

            const response = await this.api.get(`/hubs/${this.hubId}/matches?type=ongoing&offset=0&limit=20`);
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
            console.log(`[CHAT] Got match details for ${matchId}`);

            const roomId = `match-${matchId}`;
            console.log(`[CHAT] Using room ID: ${roomId}`);

            // Check if we need to authenticate
            if (!this.accessToken) {
                console.log('[CHAT] No access token, starting auth flow');
                const authUrl = await this.getAuthorizationUrl();
                return { needsAuth: true, authUrl };
            }

            // Send message using access token
            const response = await axios({
                method: 'post',
                url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                data: {
                    body: message
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
