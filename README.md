# FACEIT API Integration

This project provides a clean interface to interact with the FACEIT API, specifically designed for CS2 hub management and player statistics.

## Setup

1. Create a `.env` file in the root directory with your FACEIT API credentials:
```env
FACEIT_API_KEY=your_api_key_here
FACEIT_HUB_ID=your_hub_id_here
```

2. Install dependencies:
```bash
npm install
```

## Available Endpoints

### Hub Endpoints

#### getHubsById(hubId, expanded)
Get detailed information about a hub including name, game, organizer, etc.
- `hubId`: The ID of the hub
- `expanded`: Array of fields to expand (e.g., ['organizer', 'game'])

#### getHubMatches(hubId, type, offset, limit)
Get matches for a hub
- `hubId`: The ID of the hub
- `type`: Type of matches ('ongoing', 'past', 'upcoming')
- `offset`: Starting position (optional)
- `limit`: Number of matches to return (optional, default: 20)

### Match Endpoints

#### getMatchDetails(matchId)
Get detailed match information including teams, map, status, etc.
- `matchId`: The ID of the match

#### getMatchStats(matchId)
Get match statistics including player performance, scores, etc.
- `matchId`: The ID of the match

### Player Endpoints

#### getPlayerDetails(playerId)
Get player information including games, skill levels, etc.
- `playerId`: The ID of the player

#### getPlayerStats(playerId, gameId)
Get detailed player statistics for a specific game
- `playerId`: The ID of the player
- `gameId`: The ID of the game (e.g., 'cs2' for Counter-Strike 2)

## Usage Example

```javascript
const faceitAPI = require('./endpoints');

// Get hub information
const hubInfo = await faceitAPI.getHubsById(process.env.FACEIT_HUB_ID, ['organizer', 'game']);

// Get ongoing matches
const matches = await faceitAPI.getHubMatches(process.env.FACEIT_HUB_ID, 'ongoing');

// Get match details
const matchDetails = await faceitAPI.getMatchDetails(matchId);

// Get player stats
const playerStats = await faceitAPI.getPlayerStats(playerId, 'cs2');
```

## Testing

Run the test suite to verify the API integration:
```bash
node test/faceit-api.test.js
```

The test suite will:
1. Get matches from your hub
2. Get details and stats for a match
3. Get player details and stats for a player from the match

## Error Handling

All endpoints return an Error object if the request fails. You can check for errors like this:

```javascript
const result = await faceitAPI.getHubsById(hubId);
if (result instanceof Error) {
    console.error('Error:', result.message);
    return;
}
// Process successful result
