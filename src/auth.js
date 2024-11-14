const axios = require('axios');
const qs = require('querystring');

class FaceitAuth {
    constructor(clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
    }

    async getAccessToken() {
        try {
            console.log('[AUTH] Getting access token');
            console.log('[AUTH] Using client ID:', this.clientId);

            // Create Basic Auth header
            const credentials = `${this.clientId}:${this.clientSecret}`;
            const base64Credentials = Buffer.from(credentials).toString('base64');

            const data = {
                grant_type: 'client_credentials',
                scope: 'openid profile chat.messages.read chat.messages.write chat.rooms.read'
            };

            const response = await axios({
                method: 'post',
                url: this.tokenEndpoint,
                headers: {
                    'Authorization': `Basic ${base64Credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                data: qs.stringify(data)
            });

            console.log('[AUTH] Successfully got access token');
            return response.data.access_token;
        } catch (error) {
            console.error('[AUTH] Error getting access token:', error.message);
            if (error.response) {
                console.error('[AUTH] Response status:', error.response.status);
                console.error('[AUTH] Response data:', error.response.data);
                console.error('[AUTH] Response headers:', error.response.headers);
            }
            throw error;
        }
    }
}

module.exports = FaceitAuth;
