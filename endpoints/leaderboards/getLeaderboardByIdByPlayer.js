const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/leaderboards
    Method: GET
    Parameters: -expanded {lis of name to expand in the request} possible names: organizer, game.
    Description: 
*/
module.exports = async function getLeaderboardById(leaderboardId, playerId) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/leaderboards";

  //get url
  let url = urlConstructorUtil(
    baseURL,
    ["", "players", ""],
    [leaderboardId, "", playerId],
    [],
    [],
    {}
  );

  console.log(url);

  //try catch to make the call via axios
  try {
    let response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
};
