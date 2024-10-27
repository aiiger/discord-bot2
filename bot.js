require('dotenv').config();
const axios = require("axios");
const urlConstructorUtil = require("./utils/urlConstructor.js");
const getHeaders = require("./utils/headers.js");

/*
    Uses url https://open.faceit.com/data/v4/hubs
    Method: GET
    Parameters: -expanded {list of names to expand in the request} possible names: organizer, game.
    Description: 
*/
module.exports = async function getHubsById(hubId, expanded) {
  if (!Array.isArray(expanded)) {
    return new Error("Be sure that second argument is an array.");
  }
  let apiKey = process.env.API_KEY; // Accessing the environment variable
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/hubs";

  // Get URL
  let url = urlConstructorUtil(
    baseURL,
    [""],
    [hubId],
    ["expanded"],
    [expanded],
    {}
  );

  // Try-catch to make the call via axios
  try {
    let response = await axios.get(url, { headers });
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
};
