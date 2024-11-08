const axios = require('axios');

class FaceitJS {
    constructor() {
        // Configuration
        this.clientId = process.env.FACEIT_CLIENT_ID || 'y30bdac0f-591c-408d-88c3-bebb897339b9';
        this.clientSecret = process.env.FACEIT_CLIENT_SECRET || 'BiiHeq7uTxAVWD60y6EtWXpAONTiosJjtPqO8Va8';
        this.redirectUri = process.env.FACEIT_REDIRECT_URI || 'https://faceit-bot-test-ae3e65bcedb3.herokuapp.com/callback';
        
        // API Endpoints
        this.baseUrl = 'https://api.faceit.com';
        this.tokenEndpoint = `${this.baseUrl}/auth/v1/oauth/token`;
        this.authorizationEndpoint = 'https://accounts.faceit.com';
        this.userinfoEndpoint = `${this.baseUrl}/auth/v1/resources/userinfo`;
    }

    getAuthorizationUrl(state) {
        if (!state) {
            throw new Error('State parameter is required');
        }

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state: state,
            scope: 'openid profile email membership',
            redirect_popup: 'false',
            lang: 'en'
        });

        return `${this.authorizationEndpoint}?${params.toString()}`;
    }

    async getAccessTokenFromCode(code) {
        if (!code) {
            throw new Error('Authorization code is required');
        }

        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios.post(
                this.tokenEndpoint, 
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
                    validateStatus: status => status === 200
                }
            );

            if (!response.data.access_token) {
                throw new Error('No access token received');
            }

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                token_type: response.data.token_type,
                expires_in: response.data.expires_in
            };
        } catch (error) {
            console.error('Token exchange error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    async getUserInfo(accessToken) {
        if (!accessToken) {
            throw new Error('Access token is required');
        }

        try {
            const response = await axios.get(
                this.userinfoEndpoint,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    },
                    validateStatus: status => status === 200
                }
            );

            return response.data;
        } catch (error) {
            console.error('User info error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    async refreshAccessToken(refreshToken) {
        if (!refreshToken) {
            throw new Error('Refresh token is required');
        }

        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        try {
            const response = await axios.post(
                this.tokenEndpoint,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${credentials}`
                    },
                    validateStatus: status => status === 200
                }
            );

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                token_type: response.data.token_type,
                expires_in: response.data.expires_in
            };
        } catch (error) {
            console.error('Token refresh error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }
}

module.exports = FaceitJS;