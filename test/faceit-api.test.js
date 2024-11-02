const getHubsById = require('../endpoints/hubs/getHubsById');
const getHubMatches = require('../endpoints/hubs/getHubMatches');
const getMatchStats = require('../endpoints/matches/getMatchStats');
const getMatchDetails = require('../endpoints/matches/getMatchDetails');
require('dotenv').config();

async function testGetHubsById() {
    try {
        const hubId = process.env.FACEIT_HUB_ID;
        console.log('Using Hub ID:', hubId);
        
        console.log('\nTesting getHubsById...');
        const hubInfo = await getHubsById(hubId, ['organizer', 'game']);
        
        if (hubInfo instanceof Error) {
            throw hubInfo;
        }
        
        console.log('Hub Info:', JSON.stringify(hubInfo, null, 2));
    } catch (error) {
        console.error('\nError occurred:', error.message || error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

async function testGetHubMatches(type = 'ongoing') {
    try {
        const hubId = process.env.FACEIT_HUB_ID;
        console.log(`\nTesting getHubMatches (${type})...`);
        console.log('Getting matches for hub:', hubId);
        
        const matches = await getHubMatches(hubId, type);
        
        if (matches instanceof Error) {
            throw matches;
        }
        
        console.log('Matches:', JSON.stringify(matches, null, 2));
        
        // If there are matches, test match details and stats for the first one
        if (matches.items && matches.items.length > 0) {
            const matchId = matches.items[0].match_id;
            await testMatchInfo(matchId);
        } else {
            console.log(`No ${type} matches found`);
        }
    } catch (error) {
        console.error('\nError occurred:', error.message || error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

async function testMatchInfo(matchId) {
    try {
        // Test getMatchDetails
        console.log('\nTesting getMatchDetails...');
        console.log('Getting details for match:', matchId);
        
        const details = await getMatchDetails(matchId);
        if (details instanceof Error) {
            throw details;
        }
        console.log('Match Details:', JSON.stringify(details, null, 2));

        // Test getMatchStats
        console.log('\nTesting getMatchStats...');
        console.log('Getting stats for match:', matchId);
        
        const stats = await getMatchStats(matchId);
        if (stats instanceof Error) {
            console.log('Note: Match stats not available yet (normal for ongoing matches)');
        } else {
            console.log('Match Stats:', JSON.stringify(stats, null, 2));
        }
    } catch (error) {
        console.error('\nError occurred:', error.message || error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

// Run the tests
console.log('Starting FACEIT API tests...');
console.log('API Key available:', !!process.env.FACEIT_API_KEY);

// Test both ongoing and past matches
testGetHubMatches('ongoing');
setTimeout(() => testGetHubMatches('past'), 2000); // Wait 2 seconds before testing past matches
