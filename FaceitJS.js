const axios = require('axios');

function FaceitJS() {
    this.baseUrl = 'https://api.faceit.com';
}

FaceitJS.prototype.getChampionshipsById = async function(id) {
    const response = await axios.get(`${this.baseUrl}/championships/${id}`);
    return response.data;
};

FaceitJS.prototype.getHubsById = async function(id) {
    const response = await axios.get(`${this.baseUrl}/hubs/${id}`);
    return response.data;
};

FaceitJS.prototype.rehostChampionship = async function(eventId, gameId) {
    const response = await axios.post(`${this.baseUrl}/championships/${eventId}/rehost`, { game_id: gameId });
    return response.data;
};

FaceitJS.prototype.cancelChampionship = async function(eventId) {
    const response = await axios.post(`${this.baseUrl}/championships/${eventId}/cancel`);
    return response.data;
};

// ***** EXPORT THE FACEITJS CLASS ***** //
module.exports = FaceitJS;

// ***** ADDITIONAL EXPORTS ***** //
module.exports.getAuthorizationUrl = function(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.FACEIT_CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: 'openid profile email',
    state: state,
  });
  return `https://cdn.faceit.com/widgets/sso/index.html?${params.toString()}`;
};


module.exports.getAccessTokenFromCode = async function(code) {
  const tokenUrl = 'https://api.faceit.com/auth/v1/oauth/token';
  const data = {
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: process.env.REDIRECT_URI,
    client_id: process.env.FACEIT_CLIENT_ID,
    client_secret: process.env.FACEIT_CLIENT_SECRET,
  };

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get access token: ${error.response?.data?.error_description || error.message}`);
  }
};

module.exports.getUserInfo = async function(accessToken) {
    const response = await axios.get('https://api.faceit.com/auth/v1/userinfo', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    return response.data;
};