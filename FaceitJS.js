// FaceitJS.js
import axios from 'axios';

class FaceitJS {
    constructor() {
        this.clientId = process.env.FACEIT_CLIENT_ID;
        this.clientSecret = process.env.FACEIT_CLIENT_SECRET;
        this.redirectUri = process.env.REDIRECT_URI;
        this.apiKey = process.env.FACEIT_API_KEY_SERVER;
        this.tokenEndpoint = 'https://api.faceit.com/auth/v1/oauth/token';
    }

    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            state: state,
            scope: 'openid profile email'
        });
        
        return `https://accounts.faceit.com/auth?${params.toString()}`;
    }

    async getAccessTokenFromCode(code) {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios({
                method: 'post',
                url: this.tokenEndpoint,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`
                },
                data: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri
                })
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    async getUserInfo(accessToken) {
        try {
            const response = await axios({
                method: 'get',
                url: 'https://api.faceit.com/auth/v1/resources/userinfo',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    async refreshAccessToken(refreshToken) {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios({
                method: 'post',
                url: this.tokenEndpoint,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`
                },
                data: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to refresh token: ${error.message}`);
        }
    }

    // Additional helper methods for API calls
    async getPlayerDetails(playerId) {
        try {
            const response = await axios({
                method: 'get',
                url: `https://api.faceit.com/core/v1/users/${playerId}`,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get player details: ${error.message}`);
        }
    }
}

// Create and export a single instance
const faceitJS = new FaceitJS();
export default faceitJS;