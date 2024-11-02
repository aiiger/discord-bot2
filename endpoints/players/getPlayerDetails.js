const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/players/{player_id}
    Method: GET
    Description: Gets detailed information about a player including game-specific stats
    Returns: Player details including nickname, avatar, games, stats, etc.
*/
module.exports = async function getPlayerDetails(playerId) {
    let apiKey = process.env.FACEIT_API_KEY;
    let headers = getHeaders(apiKey);

    let baseURL = "https://open.faceit.com/data/v4/players";

    //get url
    let url = urlConstructorUtil(
        baseURL,
        [""],
        [playerId],
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
