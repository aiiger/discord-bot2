// FaceitJS.js

// ***** IMPORTS ***** //
import { AuthorizationCode } from 'simple-oauth2';
import axios from 'axios';

// CHAMPIONSHIPS
import getChampionshipsById from './endpoints/championships/getChampionshipsById.js';

class FaceitJS {
  constructor(apiKeyServerSide, apiKeyClientSide) {
    this.apiKeyServer = apiKeyServerSide;
    this.apiKeyClient = apiKeyClientSide;
    this.authState = null;
    
    // Initialize OAuth2 config
    this.oauthConfig = {
      client: {
        id: process.env.FACEIT_CLIENT_ID,
        secret: process.env.FACEIT_CLIENT_SECRET
      },
      auth: {
        tokenHost: 'https://api.faceit.com',
        tokenPath: '/auth/v1/oauth/token',
        authorizePath: '/auth/v1/oauth/authorize'
      }
    };
    
    this.oauth2 = new AuthorizationCode(this.oauthConfig);
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

  // OAuth2 Methods
  getAuthorizationUrl() {
    if (!process.env.REDIRECT_URI) {
      throw new Error('REDIRECT_URI environment variable is required');
    }

    const state = Math.random().toString(36).substring(7);
    this.authState = state;

    const options = {
      redirect_uri: process.env.REDIRECT_URI,
      scope: ['openid', 'email', 'profile'],
      state: state
    };

    return this.oauth2.authorizeURL(options);
  }

  async getAccessTokenFromCode(code) {
    if (!process.env.REDIRECT_URI) {
      throw new Error('REDIRECT_URI environment variable is required');
    }

    const options = {
      code,
      redirect_uri: process.env.REDIRECT_URI,
      scope: ['openid', 'email', 'profile']
    };

    try {
      return await this.oauth2.getToken(options);
    } catch (error) {
      console.error('Error getting token:', error.message);
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
      console.error('Error getting user info:', error.message);
      throw error;
    }
  }
}

// ***** ADD PROTOTYPE METHODS ***** //

// CHAMPIONSHIPS
FaceitJS.prototype.getChampionshipsById = getChampionshipsById;
FaceitJS.prototype.championshipsById = getChampionshipsById;

// ***** EXPORT THE FACEITJS CLASS ***** //

export default FaceitJS;
