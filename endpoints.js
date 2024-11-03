// endpoints.js

const axios = require('axios');
require('dotenv').config();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

// Rate limit handling
const rateLimits = new Map();

async function handleRateLimit(endpoint, headers) {
    const resetTime = parseInt(headers['ratelimit-reset']) * 1000;
    const remaining = parseInt(headers['ratelimit-remaining']);
    rateLimits.set(endpoint, { resetTime, remaining });

    if (remaining <= 0) {
        const waitTime = resetTime - Date.now();
        if (waitTime > 0) {
            console.log(`Rate limited for ${endpoint}. Waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

async function makeRequest(endpoint, url, options = {}) {
    try {
        const response = await axios({
            method: options.method || 'get',
            url: url,
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                ...options.headers
            },
            ...options
        });

        // Handle rate limits
        if (response.headers['ratelimit-remaining']) {
            await handleRateLimit(endpoint, response.headers);
        }

        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
            console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return makeRequest(endpoint, url, options);
        }

        console.error(`Error in ${endpoint}:`, {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        return error;
    }
}

async function getHubMatches(hubId, status = 'ongoing') {
    return makeRequest(
        'getHubMatches',
        `https://open.faceit.com/data/v4/hubs/${hubId}/matches?type=${status}`
    );
}

async function getMatchDetails(matchId) {
    return makeRequest(
        'getMatchDetails',
        `https://open.faceit.com/data/v4/matches/${matchId}`
    );
}

async function getPlayerDetails(playerId) {
    return makeRequest(
        'getPlayerDetails',
        `https://open.faceit.com/data/v4/players/${playerId}`
    );
}

// Get current rate limits
function getRateLimits() {
    return Object.fromEntries(rateLimits.entries());
}

module.exports = {
    getHubMatches,
    getMatchDetails,
    getPlayerDetails,
    getRateLimits
};
