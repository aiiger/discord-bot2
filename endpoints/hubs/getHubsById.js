const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/hubs
    Method: GET
    Parameters: -expanded {list of name to expand in the request} possible names: organizer, game.
    Description: Gets hub information by ID
*/
module.exports = async function getHubsById(hubId, expanded) {
  if (!Array.isArray(expanded)) {
    return new Error("Be sure that second argument is an array.");
  }
  let apiKey = process.env.FACEIT_API_KEY;
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/hubs";

  //get url
  let url = urlConstructorUtil(
    baseURL,
    [""],
    [hubId],
    ["expanded"],
    [expanded],
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
