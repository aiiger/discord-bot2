const axios = require('axios');
const EventEmitter = require('events');

class FaceitJS extends EventEmitter {
  constructor() {
    super();
    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
    this.redirectUri = process.env.REDIRECT_URI;
    this.baseApiUrl = 'https://open.faceit.com/data/v4';
    this.accessToken = null;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseApiUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.startPolling();
  }

  async getMatchDetails(matchId) {
    try {
      const response = await this.axiosInstance.get(`/matches/${matchId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get match details: ${error.message}`);
    }
  }

  async getHubMatches(hubId) {
    try {
      const response = await this.axiosInstance.get(`/hubs/${hubId}/matches`, {
        params: {
          offset: 0,
          limit: 20,
          status: 'ONGOING'
        }
      });
      return response.data.items;
    } catch (error) {
      throw new Error(`Failed to get hub matches: ${error.message}`);
    }
  }

  async getPlayersInMatch(matchId) {
    try {
      const response = await this.axiosInstance.get(`/matches/${matchId}/players`);
      return response.data.players || [];
    } catch (error) {
      throw new Error(`Failed to get players in match: ${error.message}`);
    }
  }

  async rehostMatch(matchId) {
    try {
      const response = await this.axiosInstance.post(`/matches/${matchId}/rehost`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to rehost match: ${error.message}`);
    }
  }

  async cancelMatch(matchId) {
    try {
      const response = await this.axiosInstance.post(`/matches/${matchId}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to cancel match: ${error.message}`);
    }
  }

  startPolling() {
    this.previousMatchStates = {};
    setInterval(async () => {
      try {
        const matches = await this.getHubMatches(process.env.HUB_ID);
        matches.forEach(match => {
          const prevState = this.previousMatchStates[match.id];
          if (prevState && prevState !== match.state) {
            this.emit('matchStateChange', match);
          }
          this.previousMatchStates[match.id] = match.state;
        });
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 10000);
  }

  onMatchStateChange(callback) {
    this.on('matchStateChange', callback);
  }
}

module.exports = FaceitJS;