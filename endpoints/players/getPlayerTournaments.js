const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/players/
    Method: GET
    Parameters: - game_player_id -> The ID of a player on game's platform
    Description: Get the tournaments of a player
*/
module.exports = async function getPlayerTournaments(
  gamePlayerId,
  offset = 0,
  limit = 20
) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/players";

  let searchOptions = {
    offset: offset,
    limit: limit,
  };

  //get url
  let url = urlConstructorUtil(
    baseURL,
    ["", "tournaments"],
    [gamePlayerId, ""],
    [],
    [],
    searchOptions
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
