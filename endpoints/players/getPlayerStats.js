const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/players/
    Method: GET
    Parameters: - gameId -> A game id on FACEIT
                - game_player_id -> The ID of a player on game's platform
    Description: Get the stats of a player in a game
*/
module.exports = async function getPlayerStats(gamePlayerId, gameId) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/players";

  //get url
  let url = urlConstructorUtil(
    baseURL,
    [""],
    [gamePlayerId],
    ["gameId"],
    [gameId],
    {}
  );

  //try catch to make the call via axios
  try {
    let response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
};
