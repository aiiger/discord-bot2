const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const qs = require('querystring');

dotenv.config();

class FaceitJS {
    constructor(app) {
        this.serverApiKey = process.env.FACEIT_API_KEY;
        this.clientApiKey = process.env.FACEIT_CLIENT_API_KEY;
        this.clientSecret = process.env.FACEIT_CLIENT_SECRET;
        this.hubId = process.env.HUB_ID;
        this.accessToken = null;
        this.codeVerifier = null;
        this.redirectUri = process.env.REDIRECT_URI;
        this.tokenPromise = null;

        // Store rehost votes per match
        this.rehostVotes = new Map(); // matchId -> Set of playerIds
        // Store cancel votes per match
        this.cancelVotes = new Map(); // matchId -> Set of playerIds

        if (!this.clientApiKey) {
            console.error('[FACEIT] Client API key not found in environment variables');
        } else {
            console.log('[FACEIT] Client API key loaded successfully');
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
            const { code } = req.query;
            if (code) {
                try {
                    const token = await this.exchangeCodeForToken(code);
                    this.accessToken = token;
                    if (this.tokenPromise) {
                        this.tokenPromise.resolve(token);
                        this.tokenPromise = null;
                    }
                    res.send('Authentication successful! You can close this window.');
                } catch (error) {
                    if (this.tokenPromise) {
                        this.tokenPromise.reject(error);
                        this.tokenPromise = null;
                    }
                    res.status(500).send('Authentication failed: ' + error.message);
                }
            } else {
                if (this.tokenPromise) {
                    this.tokenPromise.reject(new Error('No code received'));
                    this.tokenPromise = null;
                }
                res.status(400).send('No code received');
            }
        });
    }

    generateCodeVerifier() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        this.codeVerifier = verifier;
        return verifier;
    }

    async generateCodeChallenge(verifier) {
        const hash = crypto.createHash('sha256');
        hash.update(verifier);
        return hash.digest('base64url');
    }

    async getAccessToken() {
        try {
            // If we already have a token, return it
            if (this.accessToken) {
                return this.accessToken;
            }

            // If we're already waiting for a token, return the same promise
            if (this.tokenPromise) {
                return this.tokenPromise.promise;
            }

            console.log('[AUTH] Getting access token');

            // Generate PKCE code verifier and challenge
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);

            // Build authorization URL with required scopes
            const scopes = ['chat.messages.read', 'chat.messages.write', 'chat.rooms.read'].join(' ');
            const authUrl = `https://accounts.faceit.com/authorize?client_id=${this.clientApiKey}&response_type=code&redirect_uri=${encodeURIComponent(this.redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=${encodeURIComponent(scopes)}`;

            // Create a promise that will be resolved when we get the token
            this.tokenPromise = {};
            const promise = new Promise((resolve, reject) => {
                this.tokenPromise.resolve = resolve;
                this.tokenPromise.reject = reject;
            });
            this.tokenPromise.promise = promise;

            // Provide authorization URL
            console.log('[AUTH] Please visit this URL to authorize the application:');
            console.log(authUrl);

            // Wait for the callback to resolve the promise
            return promise;
        } catch (error) {
            console.error('[AUTH] Error getting access token:', error.message);
            throw error;
        }
    }

    async exchangeCodeForToken(code) {
        try {
            const data = qs.stringify({
                grant_type: 'authorization_code',
                client_id: this.clientApiKey,
                client_secret: this.clientSecret,
                code: code,
                code_verifier: this.codeVerifier,
                redirect_uri: this.redirectUri
            });

            const response = await axios({
                method: 'post',
                url: 'https://api.faceit.com/auth/v1/oauth/token',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: data
            });

            return response.data.access_token;
        } catch (error) {
            console.error('[AUTH] Error exchanging code for token:', error.message);
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

    async getPlayerDetails(playerId) {
        try {
            const response = await this.api.get(`/players/${playerId}`);
            return response.data;
        } catch (error) {
            console.error(`[PLAYER] Error getting player details for ${playerId}:`, error.message);
            throw error;
        }
    }

    async handleRehostVote(matchId, playerId) {
        try {
            // Initialize votes for this match if not exists
            if (!this.rehostVotes.has(matchId)) {
                this.rehostVotes.set(matchId, new Set());
            }

            const votes = this.rehostVotes.get(matchId);

            // Add vote
            votes.add(playerId);

            // Get match details to count total players
            const match = await this.getMatchDetails(matchId);
            const totalPlayers = match.teams.faction1.roster.length + match.teams.faction2.roster.length;

            // Check if we have enough votes (6/10 players)
            const requiredVotes = Math.ceil(totalPlayers * 0.6); // 60% of players
            const currentVotes = votes.size;

            // Prepare response message
            let message;
            if (currentVotes >= requiredVotes) {
                message = `Rehost vote passed! (${currentVotes}/${totalPlayers} players voted)`;
                // Reset votes for this match
                this.rehostVotes.delete(matchId);
            } else {
                message = `Rehost vote registered. Current votes: ${currentVotes}/${requiredVotes} required`;
            }

            return {
                success: true,
                passed: currentVotes >= requiredVotes,
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

            // Get fresh access token
            const token = await this.getAccessToken();
            console.log('[CHAT] Got fresh access token');

            // Send message using access token
            const response = await axios({
                method: 'post',
                url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                data: {
                    body: message
                }
            });

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
