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
        // REQUIRED parameters according to the spec
        const params = new URLSearchParams({
            // REQUIRED. Must contain openid scope value
            scope: 'openid profile email membership chat.messages.read chat.messages.write chat.rooms.read',
            
            // REQUIRED. Must be 'code' for Authorization Code Flow
            response_type: 'code',
            
            // REQUIRED. Your client ID
            client_id: this.clientId,
            
            // REQUIRED. Must exactly match the registered redirect URI
            redirect_uri: this.redirectUri,
            
            // RECOMMENDED for CSRF protection
            state: state
        });
        
        // Use HTTPS endpoint as required by the spec
        return `https://api.faceit.com/auth/v1/oauth/authorize?${params.toString()}`;
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
            console.error('Token exchange error:', error.response?.data || error.message);
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
            console.error('User info error:', error.response?.data || error.message);
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
            console.error('Token refresh error:', error.response?.data || error.message);
            throw new Error(`Failed to refresh token: ${error.message}`);
        }
    }
}

// Create and export a single instance
const faceitJS = new FaceitJS();
export default faceitJS;