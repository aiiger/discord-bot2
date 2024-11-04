const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/tournaments
    Method: GET
    Parameters: - tournamentId : string
    Description: 
*/
module.exports = async function getTournamentsByIdBrackets(tournamentId) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/tournaments";

  //get url
  let url = urlConstructorUtil(
    baseURL,
    ["", "brackets"],
    [tournamentId, ""],
    [],
    [],
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
