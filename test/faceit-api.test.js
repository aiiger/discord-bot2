const faceitAPI = require('../endpoints');
require('dotenv').config();

/*
FACEIT API Endpoints:

Hub Endpoints:
- getHubsById: Get detailed information about a hub including name, game, organizer, etc.
- getHubMatches: Get matches for a hub (ongoing, past, or upcoming)

Match Endpoints:
- getMatchDetails: Get detailed match information including teams, map, status, etc.
- getMatchStats: Get match statistics including player performance, scores, etc.

Player Endpoints:
- getPlayerDetails: Get player information including games, skill levels, etc.
- getPlayerStats: Get detailed player statistics for a specific game
*/

async function testGetHubsById() {
    try {
        const hubId = process.env.FACEIT_HUB_ID;
        console.log('Using Hub ID:', hubId);
        
        console.log('\nTesting getHubsById...');
        const hubInfo = await faceitAPI.getHubsById(hubId, ['organizer', 'game']);
        
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

async function testGetHubMatches() {
    try {
        const hubId = process.env.FACEIT_HUB_ID;
        console.log('\nTesting getHubMatches...');
        console.log('Getting past matches for hub:', hubId);
        
        const matches = await faceitAPI.getHubMatches(hubId, 'past', 0, 1); // Get just 1 past match
        
        if (matches instanceof Error) {
            throw matches;
        }
        
        console.log('Matches:', JSON.stringify(matches, null, 2));
        
        // If there are matches, test match details and stats
        if (matches.items && matches.items.length > 0) {
            const match = matches.items[0];
            await testMatchInfo(match.match_id);
            
            // Test player details and stats for a player from the match
            const player = match.teams.faction1.roster[0];
            await testPlayerInfo(player.player_id, player.nickname);
        } else {
            console.log('No matches found to test with');
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
        
        const details = await faceitAPI.getMatchDetails(matchId);
        if (details instanceof Error) {
            throw details;
        }
        console.log('Match Details:', JSON.stringify(details, null, 2));

        // Test getMatchStats
        console.log('\nTesting getMatchStats...');
        console.log('Getting stats for match:', matchId);
        
        const stats = await faceitAPI.getMatchStats(matchId);
        if (stats instanceof Error) {
            console.log('Note: Match stats not available');
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

async function testPlayerInfo(playerId, nickname) {
    try {
        // Test player details
        console.log('\nTesting getPlayerDetails...');
        console.log(`Getting details for player: ${nickname} (${playerId})`);
        
        const details = await faceitAPI.getPlayerDetails(playerId);
        if (details instanceof Error) {
            throw details;
        }
        console.log('Player Details:', JSON.stringify(details, null, 2));

        // Test player stats
        console.log('\nTesting getPlayerStats...');
        console.log(`Getting CS2 stats for player: ${nickname}`);
        
        const stats = await faceitAPI.getPlayerStats(playerId, 'cs2');
        if (stats instanceof Error) {
            throw stats;
        }
        console.log('Player Stats:', JSON.stringify(stats, null, 2));
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

// Test hub matches (which will also test match details, stats, and player info)
testGetHubMatches();
