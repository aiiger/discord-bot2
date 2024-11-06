// FaceitJS.js
import axios from 'axios';

export class FaceitJS {
  constructor() {
    this.baseUrl = 'https://api.faceit.com';
  }

  async getChampionshipsById(id) {
    const response = await axios.get(`${this.baseUrl}/championships/${id}`);
    return response.data;
  }

  async getHubsById(id) {
    const response = await axios.get(`${this.baseUrl}/hubs/${id}`);
    return response.data;
  }

  async rehostChampionship(eventId, gameId) {
    const response = await axios.post(`${this.baseUrl}/championships/${eventId}/rehost`, { gameId });
    return response.data;
  }

  async cancelChampionship(eventId) {
    const response = await axios.post(`${this.baseUrl}/championships/${eventId}/cancel`);
    return response.data;
  }
}

// FaceitJS.js

module.exports.getAuthorizationUrl = function(state) {
  const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.FACEIT_CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      scope: 'openid profile email',
      state: state,
  });
  return `https://www.faceit.com/oauth/authorize?${params.toString()}`;
};

export async function getAccessTokenFromCode(code) {
  const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: process.env.REDIRECT_URI,
    client_id: process.env.FACEIT_CLIENT_ID,
    client_secret: process.env.FACEIT_CLIENT_SECRET,
  });

  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

export async function getUserInfo(accessToken) {
  const response = await axios.get(`${this.baseUrl}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.data;
}