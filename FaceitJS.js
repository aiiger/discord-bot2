// FaceitJS.js

// Define the FaceitJS class and its methods
function FaceitJS() {
  // Your constructor implementation here
}

function getChampionshipsById(id) {
  // Your implementation here
}

function getHubsById(id) {
  // Your implementation here
}

FaceitJS.prototype.championshipsById = getChampionshipsById;

// HUBS
FaceitJS.prototype.getHubsById = getHubsById;
FaceitJS.prototype.hubsById = getHubsById;

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
  return `https://www.faceit.com/oauth/authorize?${params.toString()}`;
};

    // ***** CHAMPIONSHIP ACTIONS ***** //

    /**
     * Rehost a championship event.
     * @param {string} eventId - The ID of the championship event.
     * @param {string} gameId - The ID of the game.
     * @returns {Promise<Object>} - The response data from the API.
     */
    async rehostChampionship(eventId, gameId) {
        try {
            const url = `https://api.faceit.com/championships/v1/events/${eventId}/rehost`;
            const data = { gameId };
            const headers = this.getHeader();
            const response = await axios.post(url, data, headers);
            return response.data;
        } catch (error) {
            logger.error(`Error rehosting championship: ${error.response?.data || error.message}`);
            throw error;
        }
    }

    /**
     * Cancel a championship event.
     * @param {string} eventId - The ID of the championship event.
     * @returns {Promise<Object>} - The response data from the API.
     */
    async cancelChampionship(eventId) {
        try {
            const url = `https://api.faceit.com/championships/v1/events/${eventId}/cancel`;
            const headers = this.getHeader();
            const response = await axios.post(url, {}, headers);
            return response.data;
        } catch (error) {
            logger.error(`Error canceling championship: ${error.response?.data || error.message}`);
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

    // Use the correct OAuth2 authorization endpoint
    return `https://api.faceit.com/auth/v1/oauth/authorize?${params.toString()}`;
};
