const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/players/{player_id}/stats/{game_id}
    Method: GET
    Description: Gets player statistics for a specific game
    Parameters:
    - playerId: The ID of the player
    - gameId: The ID of the game (e.g., 'cs2' for Counter-Strike 2)
    Returns: Player statistics including K/D ratio, win rate, recent results, etc.
*/
module.exports = async function getPlayerStats(playerId, gameId = 'cs2') {
    let apiKey = process.env.FACEIT_API_KEY;
    let headers = getHeaders(apiKey);

    let baseURL = "https://open.faceit.com/data/v4/players";

    //get url
    let url = urlConstructorUtil(
        baseURL,
        ["", "stats"],
        [playerId, gameId],
        [],
        [],
        {}
    );

    //try catch to make the call via axios
    try {
        let response = await axios.get(url, headers);
        return response.data;
    } catch (err) {
        return new Error(err.response?.data || err.message);
    }
};
