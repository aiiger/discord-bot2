const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/rankings
    Method: GET
    Parameters: 
    Description: Get the ranking of a region
*/
module.exports = async function getRanking(
  gameId,
  region,
  country = "",
  offset = 0,
  limit = 20
) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/rankings";

  let searchOptions = {
    offset: offset,
    limit: limit,
  };

  //get url
  let url = urlConstructorUtil(
    baseURL,
    ["games", "regions"],
    [gameId, region],
    ["country"],
    [country],
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
