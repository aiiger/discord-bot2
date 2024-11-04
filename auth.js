import { AuthorizationCode } from 'simple-oauth2';
import dotenv from 'dotenv';

dotenv.config();

const config = {
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

const client = new AuthorizationCode(config);

// Store state for CSRF protection
let authState = null;

const auth = {
  getAuthorizationUrl() {
    const state = Math.random().toString(36).substring(7);
    authState = state;

    const options = {
      redirect_uri: process.env.REDIRECT_URI,
      scope: ['openid', 'email', 'profile'],
      state: state
    };

    return client.authorizeURL(options);
  },

  async getAccessTokenFromCode(code) {
    const options = {
      code,
      redirect_uri: process.env.REDIRECT_URI,
      scope: ['openid', 'email', 'profile']
    };

    try {
      return await client.getToken(options);
    } catch (error) {
      console.error('Error getting token:', error.message);
      throw error;
    }
  },

  getAuthState() {
    return {
      validate: (state) => state === authState
    };
  }
};

export default auth;
