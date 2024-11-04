const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/organizers
    Method: GET
    Parameters: -expanded {lis of name to expand in the request} possible names: organizer, game.
    Description: 
*/
module.exports = async function getOrganizers(organizerName) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/organizers";

  //get url
  let url = urlConstructorUtil(baseURL, [], [], ["name"], [organizerName], {});

  //try catch to make the call via axios
  try {
    let response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
};
