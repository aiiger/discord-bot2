const crypto = require('crypto');
const axios = require('axios');

class FaceitAuth {
    constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.endpoints = null;
        this.codeVerifier = null;
        this.state = null;
    }

    async initialize() {
        try {
            // Get OpenID configuration
            const response = await axios.get('https://api.faceit.com/auth/v1/openid_configuration');
            this.endpoints = response.data;
            console.log('[AUTH] Initialized with OpenID configuration');
        } catch (error) {
            console.error('[AUTH] Error getting OpenID configuration:', error.message);
            throw error;
        }
    }

    generateCodeVerifier() {
        // Generate a random string of 32 bytes and base64url encode it
        const verifier = crypto.randomBytes(32).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        this.codeVerifier = verifier;
        return verifier;
    }

    async generateCodeChallenge(verifier) {
        // Create SHA256 hash of the code verifier
        const hash = crypto.createHash('sha256');
        hash.update(verifier);
        // Base64url encode the hash
        return hash.digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    generateState() {
        // Generate a random state parameter to prevent CSRF
        const state = crypto.randomBytes(16).toString('hex');
        this.state = state;
        return state;
    }

    async getAuthorizationUrl() {
        if (!this.endpoints) {
            await this.initialize();
        }

        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = this.generateState();

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state: state,
            scope: 'openid profile chat.messages.read chat.messages.write chat.rooms.read'
        });

        return `${this.endpoints.authorization_endpoint}?${params.toString()}`;
    }

    async exchangeCodeForToken(code) {
        if (!this.endpoints || !this.codeVerifier) {
            throw new Error('Auth not properly initialized');
        }

        try {
            const response = await axios({
                method: 'post',
                url: this.endpoints.token_endpoint,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code_verifier: this.codeVerifier,
                    code: code,
                    redirect_uri: this.redirectUri
                }).toString()
            });

            return response.data;
        } catch (error) {
            console.error('[AUTH] Error exchanging code for token:', error.message);
            throw error;
        }
    }

    verifyState(receivedState) {
        return this.state === receivedState;
    }
}

module.exports = FaceitAuth;
