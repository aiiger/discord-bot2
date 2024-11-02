const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/hubs/{hub_id}/matches
    Method: GET
    Parameters: 
    - type: Type of matches to return (past, ongoing, upcoming)
    - offset: The starting item position
    - limit: The number of items to return (default: 20)
    Description: Gets matches for a specific hub
*/
module.exports = async function getHubMatches(hubId, type = 'ongoing', offset = 0, limit = 20) {
    let apiKey = process.env.FACEIT_API_KEY;
    let headers = getHeaders(apiKey);

    let baseURL = "https://open.faceit.com/data/v4/hubs";

    //get url with query parameters
    let url = urlConstructorUtil(
        baseURL,
        ["", "matches"],
        [hubId, ""],
        ["type", "offset", "limit"],
        [type, offset, limit],
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
