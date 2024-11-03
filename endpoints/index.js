import faceitAPI from './endpoints/faceitAPI.js';

// Hub endpoints
const getHubsById = require('./hubs/getHubsById');
const getHubMatches = require('./hubs/getHubMatches');

// Match endpoints
const getMatchDetails = require('./matches/getMatchDetails');
const getMatchStats = require('./matches/getMatchStats');

// Player endpoints
const getPlayerDetails = require('./players/getPlayerDetails');
const getPlayerStats = require('./players/getPlayerStats');

module.exports = {
    // Hub endpoints
    getHubsById,
    getHubMatches,
    
    // Match endpoints
    getMatchDetails,
    getMatchStats,
    
    // Player endpoints
    getPlayerDetails,
    getPlayerStats
};
