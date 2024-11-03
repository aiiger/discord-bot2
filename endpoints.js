// endpoints.js

const axios = require('axios');

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

async function getHubMatches(hubId, status = 'ongoing') {
    try {
        const response = await axios({
            method: 'get',
            url: `https://open.faceit.com/data/v4/hubs/${hubId}/matches?type=${status}`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching hub matches:', error.response?.data || error.message);
        return error;
    }
}

async function getMatchDetails(matchId) {
    try {
        const response = await axios({
            method: 'get',
            url: `https://open.faceit.com/data/v4/matches/${matchId}`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching match details:', error.response?.data || error.message);
        return error;
    }
}

async function getPlayerDetails(playerId) {
    try {
        const response = await axios({
            method: 'get',
            url: `https://open.faceit.com/data/v4/players/${playerId}`,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching player details:', error.response?.data || error.message);
        return error;
    }
}

module.exports = {
    getHubMatches,
    getMatchDetails,
    getPlayerDetails
};
