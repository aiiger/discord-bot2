<<<<<<< HEAD
const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/hubs
    Method: GET
    Parameters: -expanded {lis of name to expand in the request} possible names: organizer, game.
    Description: 
*/
module.exports = async function getHubsById(hubId, expanded) {
  if (!Array.isArray(expanded)) {
    return new Error("Be sure that second argument is an array.");
  }
=======
import axios from "axios";
import urlConstructorUtil from "../../utils/urlConstructor.js";
import getHeaders from "../../utils/headers.js";

export default async function getHubsById(hubId) {
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/hubs";

  //get url
<<<<<<< HEAD
  let url = urlConstructorUtil(
    baseURL,
    [""],
    [hubId],
    ["expanded"],
    [expanded],
    {}
  );
=======
  let url = urlConstructorUtil(baseURL, [""], [hubId], [], [], {});
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98

  //try catch to make the call via axios
  try {
    let response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
<<<<<<< HEAD
};
=======
}
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
