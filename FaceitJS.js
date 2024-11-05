// FaceitJS.js

// ***** IMPORTS ***** //
import axios from 'axios';

// CHAMPIONSHIPS
import getChampionshipsById from './endpoints/championships/getChampionshipsById.js';

// HUBS
import getHubsById from './endpoints/hubs/getHubsById.js';

class FaceitJS {
  constructor(apiKeyServerSide, apiKeyClientSide) {
    this.apiKeyServer = apiKeyServerSide;
    this.apiKeyClient = apiKeyClientSide;
    this.authState = null;
  }

  getApiKeyServer() {
    return this.apiKeyServer;
  }

  setApiKeyServer(apiKeyServerSide) {
    this.apiKeyServer = apiKeyServerSide;
  }

  getApiKeyClient() {
    return this.apiKeyClient;
  }

  setApiKeyClient(apiKeyClientSide) {
    this.apiKeyClient = apiKeyClientSide;
  }

  getHeader() {
    return {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${this.apiKeyServer}`,
      },
    };
  }

  // Generate authorization URL for FACEIT login
  getAuthorizationUrl() {
    const state = Math.random().toString(36).substring(7);
    this.authState = state;
  
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.FACEIT_CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      scope: 'openid profile email',
      state: state,
      redirect_popup: 'true',
      redirect_fragment: 'true',
    });
  
    return `https://cdn.faceit.com/widgets/sso/index.html?${params.toString()}`;
  }
  

  // Exchange authorization code for access token
  async getAccessTokenFromCode(code) {
    try {
      const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
      
      const credentials = Buffer.from(
        `${process.env.FACEIT_CLIENT_ID}:${process.env.FACEIT_CLIENT_SECRET}`
      ).toString('base64');

      const data = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI
      });

      const response = await axios.post(tokenUrl, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw error;
    }
  }

  validateState(state) {
    return state === this.authState;
  }

  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(
        'https://api.faceit.com/auth/v1/resources/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting user info:', error.response?.data || error.message);
      throw error;
    }
  }
}

// ***** ADD PROTOTYPE METHODS ***** //

// CHAMPIONSHIPS
FaceitJS.prototype.getChampionshipsById = getChampionshipsById;
FaceitJS.prototype.championshipsById = getChampionshipsById;

// HUBS
FaceitJS.prototype.getHubsById = getHubsById;
FaceitJS.prototype.hubsById = getHubsById;

// ***** EXPORT THE FACEITJS CLASS ***** //

export default FaceitJS;
