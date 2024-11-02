const faceitAPI = require('../endpoints');
require('dotenv').config();
const assert = require('assert');

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
        console.log('Using Hub ID:', hubId);
        
        console.log('\nTesting getHubMatches...');
        const matches = await faceitAPI.getHubMatches(hubId);
        
        if (matches instanceof Error) {
            throw matches;
        }
        
        console.log('Matches:', JSON.stringify(matches, null, 2));
        
        if (matches.length > 0) {
            const matchId = matches[0].match_id;
            console.log('\nTesting getMatchDetails...');
            const matchDetails = await faceitAPI.getMatchDetails(matchId);
            
            if (matchDetails instanceof Error) {
                throw matchDetails;
            }
            
            console.log('Match Details:', JSON.stringify(matchDetails, null, 2));
            
            console.log('\nTesting getPlayerDetails...');
            const playerId = matchDetails.teams.faction1.players[0].player_id;
            const playerDetails = await faceitAPI.getPlayerDetails(playerId);
            
            if (playerDetails instanceof Error) {
                throw playerDetails;
            }
            
            console.log('Player Details:', JSON.stringify(playerDetails, null, 2));
        }
    } catch (error) {
        console.error('\nError occurred:', error.message || error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

// Mock function to simulate bot behavior
function botCommand(command, votes, eloDifferential) {
    if (command === '!rehost') {
        return votes >= 6 ? 'Rehost initiated' : 'Rehost failed';
    } else if (command === '!cancel') {
        return eloDifferential >= 70 ? 'Match cancelled' : 'Match continues';
    }
    return 'Invalid command';
}

// Test for bot commands
describe('Bot Commands', function() {
    it('should initiate rehost if 6 or more players vote yes', function() {
        const result = botCommand('!rehost', 6, 0);
        assert.strictEqual(result, 'Rehost initiated');
    });

    it('should fail rehost if less than 6 players vote yes', function() {
        const result = botCommand('!rehost', 5, 0);
        assert.strictEqual(result, 'Rehost failed');
    });

    it('should cancel match if elo differential is 70 or greater', function() {
        const result = botCommand('!cancel', 0, 70);
        assert.strictEqual(result, 'Match cancelled');
    });

    it('should not cancel match if elo differential is less than 70', function() {
        const result = botCommand('!cancel', 0, 69);
        assert.strictEqual(result, 'Match continues');
    });
});

// Execute tests
(async () => {
    await testGetHubsById();
    await testGetHubMatches();
})();