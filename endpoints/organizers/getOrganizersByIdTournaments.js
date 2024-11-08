const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/data/v4/organizers
    Method: GET
    Parameters: @type - "", "past", "upcoming"
    Description: 
*/
module.exports = async function getOrganizersByIdTournaments(
  organizerId,
  type = "",
  offset = 0,
  limit = 20
) {
  if (!(type === "" || type === "past" || type === "upcoming")) {
    return { error: "type must be: '', 'past' or 'upcoming'" };
  }

  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/organizers";

  let searchOptions = {
    offset: offset,
    limit: limit,
  };

  //get url
  let url = urlConstructorUtil(
    baseURL,
    ["", "hubs"],
    [organizerId, ""],
    ["type"],
    [type],
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
