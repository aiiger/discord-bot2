// FaceitJS.js
const axios = require('axios');
const { EventEmitter } = require('events');
const WebSocket = require('ws');

class FaceitJS extends EventEmitter {
    constructor() {
        super();
        this.apiBase = 'https://open.faceit.com/data/v4';
        this.chatApiBase = 'https://api.faceit.com/chat/v1';
        this.matchApiBase = 'https://api.faceit.com/match/v1';

        this.hubId = process.env.HUB_ID;
        this.apiKey = process.env.FACEIT_API_KEY;
        this.accessToken = null;

        this.wsConnection = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pollingInterval = null;

        this.activeMatches = new Map();
        this.matchStates = new Map();
        this.vetoStates = new Map();

        // Initialize API instances in constructor
        this.setupApiInstances();
    }

    setAccessToken(token) {
        this.accessToken = token;
        this.setupApiInstances();
        if (token) {
            this.connectWebSocket();
            this.startPolling();
        }
    }

    setupApiInstances() {
        this.dataApiInstance = axios.create({
            baseURL: this.apiBase,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/json'
            }
        });

        this.chatApiInstance = axios.create({
            baseURL: this.chatApiBase,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json'
            }
        });

        this.matchApiInstance = axios.create({
            baseURL: this.matchApiBase,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json'
            }
        });
    }

    async connectWebSocket() {
        try {
            if (this.wsConnection) {
                this.wsConnection.terminate();
            }

            this.wsConnection = new WebSocket('wss://api.faceit.com/chat/v1/ws', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this.wsConnection.on('open', () => {
                console.log('[WS] Connection established');
                this.wsReconnectAttempts = 0;
                this.emit('wsConnected');
            });

            this.wsConnection.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.event === 'message' && message.payload) {
                        await this.handleChatMessage(message.payload);
                    }
                } catch (error) {
                    console.error('[WS] Error processing message:', error);
                }
            });

            this.wsConnection.on('close', () => {
                console.log('[WS] Connection closed');
                this.handleReconnect();
            });

            this.wsConnection.on('error', (error) => {
                console.error('[WS] Error:', error);
                this.handleReconnect();
            });

        } catch (error) {
            console.error('[WS] Connection error:', error);
            this.handleReconnect();
        }
    }

    async startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('[POLLING] Starting match polling');
        await this.checkMatches(); // Initial check

        this.pollingInterval = setInterval(async () => {
            try {
                await this.checkMatches();
            } catch (error) {
                console.error('[POLLING] Error:', error);
                this.emit('pollingError', error);
            }
        }, 30000); // Check every 30 seconds
    }

    async checkMatches() {
        try {
            const response = await this.dataApiInstance.get(`/hubs/${this.hubId}/matches`, {
                params: {
                    status: 'ONGOING',
                    limit: 50
                }
            });

            const matches = response.data.items;

            for (const match of matches) {
                const matchId = match.match_id;
                const currentState = this.matchStates.get(matchId);

                // New match detection
                if (!this.activeMatches.has(matchId)) {
                    this.activeMatches.set(matchId, match);
                    this.matchStates.set(matchId, {
                        status: match.status,
                        vetoComplete: false,
                        greetingSent: false
                    });
                    this.emit('newMatch', match);
                    await this.handleMatchState(match);
                } else if (currentState.status !== match.status) {
                    // Status change detection
                    this.matchStates.set(matchId, {
                        ...currentState,
                        status: match.status
                    });
                    this.emit('matchStatusChange', { matchId, oldStatus: currentState.status, newStatus: match.status });
                    await this.handleMatchState(match);
                }

                // Veto phase check
                if (match.status === 'VOTING' && !currentState?.greetingSent) {
                    await this.handleVetoPhase(match);
                }
            }

            // Cleanup finished matches
            for (const [matchId, match] of this.activeMatches.entries()) {
                if (!matches.some(m => m.match_id === matchId)) {
                    this.activeMatches.delete(matchId);
                    this.matchStates.delete(matchId);
                    this.emit('matchComplete', { matchId, match });
                }
            }

        } catch (error) {
            console.error('[MATCHES] Check error:', error);
            throw error;
        }
    }

    async handleMatchState(match) {
        const state = this.matchStates.get(match.match_id);

        switch (match.status) {
            case 'VOTING':
                if (!state.greetingSent) {
                    await this.handleVetoPhase(match);
                }
                break;
            case 'READY':
                await this.sendChatMessage(match.match_id,
                    "📢 Match is ready! Please join the server."
                );
                break;
            case 'ONGOING':
                if (state.status !== 'ONGOING') {
                    await this.sendChatMessage(match.match_id,
                        "🎮 Match has started! Good luck and have fun!"
                    );
                }
                break;
            case 'CANCELLED':
                await this.sendChatMessage(match.match_id,
                    "⚠️ Match has been cancelled."
                );
                break;
            case 'FINISHED':
                await this.sendChatMessage(match.match_id,
                    "🏁 Match has ended. GG WP!"
                );
                break;
        }
    }

    async handleVetoPhase(match) {
        try {
            const state = this.matchStates.get(match.match_id);
            if (!state.greetingSent) {
                await this.sendChatMessage(match.match_id,
                    "👋 Welcome to the map veto phase!\n" +
                    "Use !veto [map] to ban a map.\n" +
                    "Available commands: !maps, !veto, !help"
                );

                this.matchStates.set(match.match_id, {
                    ...state,
                    greetingSent: true
                });

                this.emit('vetoStarted', match);
            }
        } catch (error) {
            console.error('[VETO] Error:', error);
        }
    }

    handleReconnect() {
        if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
            this.wsReconnectAttempts++;
            console.log(`[WS] Reconnecting (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connectWebSocket(), 5000 * this.wsReconnectAttempts);
        } else {
            console.error('[WS] Max reconnection attempts reached');
            this.emit('wsMaxReconnectAttempts');
        }
    }

    async sendChatMessage(matchId, message) {
        try {
            await this.chatApiInstance.post(`/rooms/${matchId}/messages`, {
                message: message
            });
            return true;
        } catch (error) {
            console.error('[CHAT] Send error:', error);
            return false;
        }
    }

    async getActiveMatches() {
        try {
            if (!this.dataApiInstance) {
                this.setupApiInstances();
            }

            const response = await this.dataApiInstance.get(`/hubs/${this.hubId}/matches`, {
                params: {
                    status: 'ONGOING',
                    limit: 50
                }
            });
            return response.data.items;
        } catch (error) {
            console.error('[MATCHES] Get error:', error);
            throw error;
        }
    }

    async sendTestMessage(matchId, message) {
        try {
            const success = await this.sendChatMessage(matchId, message);
            return success;
        } catch (error) {
            console.error('[TEST] Message error:', error);
            return false;
        }
    }

    stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        if (this.wsConnection) {
            this.wsConnection.terminate();
        }
    }
}

module.exports = { FaceitJS };
