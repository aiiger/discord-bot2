import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

class FaceitJS {
  constructor() {
    this.clientId = process.env.FACEIT_CLIENT_ID;
    this.clientSecret = process.env.FACEIT_CLIENT_SECRET;
    this.redirectUri = process.env.REDIRECT_URI;
    this.tokenEndpoint = process.env.TOKEN_ENDPOINT;
    this.authorizationEndpoint = process.env.AUTHORIZATION_ENDPOINT;
    this.scope = process.env.SCOPE;
  }

  generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: this.scope,
    });
    return `${this.authorizationEndpoint}?${params.toString()}`;
  }

  async getAccessTokenFromCode(code) {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    try {
      const response = await axios.post(this.tokenEndpoint, new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      });
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

  async refreshAccessToken(refreshToken) {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    try {
      const response = await axios.post(this.tokenEndpoint, new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }
}

const faceitJS = new FaceitJS();
export default faceitJS;
