const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/chat/v1/rooms/asd
    Method: GET
    Parameters: - roomId : string
    Description: 
*/
module.exports = async function getRoomById(roomId) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/chat/v1/rooms";

  //get url
  let url = urlConstructorUtil(
    baseURL,
    [""],
    [roomId],
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
