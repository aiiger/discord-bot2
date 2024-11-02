const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/matches/{match_id}
    Method: GET
    Description: Gets detailed information about a specific match
    Returns: Match details including teams, map, status, and current score
*/
module.exports = async function getMatchDetails(matchId) {
    let apiKey = process.env.FACEIT_API_KEY;
    let headers = getHeaders(apiKey);

    let baseURL = "https://open.faceit.com/data/v4/matches";

    //get url
    let url = urlConstructorUtil(
        baseURL,
        [""],
        [matchId],
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
