// FaceitJS.js

// Define the FaceitJS class and its methods
function FaceitJS() {
  // Your constructor implementation here
}

FaceitJS.prototype.getChampionshipsById = function(id) {
  // Your implementation here
};

FaceitJS.prototype.getHubsById = function(id) {
  // Your implementation here
};

FaceitJS.prototype.rehostChampionship = async function(eventId, gameId) {
  // Your implementation here
};

FaceitJS.prototype.cancelChampionship = async function(eventId) {
  // Your implementation here
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
  return `https://www.faceit.com/oauth/authorize?${params.toString()}`;
};

module.exports.getAccessTokenFromCode = async function(code) {
  // Your implementation here
};

module.exports.getUserInfo = async function(accessToken) {
  // Your implementation here
};