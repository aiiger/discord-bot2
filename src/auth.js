const crypto = require('crypto');
const axios = require('axios');

class Auth {
    constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    async generateAuthUrl() {
        // Generate code verifier
        const codeVerifier = crypto.randomBytes(32).toString('base64url');

        // Generate code challenge
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        // Generate state
        const state = crypto.randomBytes(32).toString('hex');

        // Construct authorization URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'openid profile chat',
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const url = `https://accounts.faceit.com/oauth/authorize?${params}`;

        return {
            url,
            state,
            codeVerifier
        };
    }

    async exchangeCode(code, codeVerifier) {
        try {
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            });

            const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    async refreshToken(refreshToken) {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.clientId,
                client_secret: this.clientSecret
            });

            const response = await axios.post('https://api.faceit.com/auth/v1/oauth/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error refreshing token:', error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }
}

module.exports = Auth;
