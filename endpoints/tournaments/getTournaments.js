const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/tournaments
    Method: GET
    Parameters: - game : string
                - region : string
                - offset : integer
                - limit : integer
    Description: 
*/
module.exports = async function getTournaments(
  game,
  region,
  offset = 0,
  limit = 20
) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/tournaments";

  let searchOptions = {
    offset: offset,
    limit: limit,
  };

  //get url
  let url = urlConstructorUtil(
    baseURL,
    [],
    [],
    ["game", "region"],
    [game, region],
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
