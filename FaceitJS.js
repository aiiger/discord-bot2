const axios = require('axios');

class FaceitJS {
    constructor() {
        this.clientId = 'y30bdac0f-591c-408d-88c3-bebb897339b9'; // Replace with your actual client ID
        this.clientSecret = 'BiiHeq7uTxAVWD60y6EtWXpAONTiosJjtPqO8Va8'; // Replace with your actual client secret
        this.redirectUri = 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback'; // Replace with your actual redirect URI
        this.tokenEndpoint = 'https://accounts.faceit.com/token';
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state: state,
            scope: 'openid profile email membership chat.messages.read chat.messages.write chat.rooms.read',
            redirect_popup: 'false',
            lang: 'en'
        });

        return `https://accounts.faceit.com/accounts?${params.toString()}`;
    }

    async getAccessTokenFromCode(code) {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios.post(this.tokenEndpoint, 
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri,
                }), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${credentials}`,
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    async getUserInfo(accessToken) {
        try {
            const response = await axios.get('https://api.faceit.com/auth/v1/resources/userinfo', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            return response.data;
        } catch (error) {
            console.error('User info error:', error.response?.data || error.message);
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }
}

module.exports = FaceitJS;