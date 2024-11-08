const axios = require("axios");
const urlConstructorUtil = require("../../utils/urlConstructor.js");
const getHeaders = require("../../utils/headers.js");
/*
    Uses url https://open.faceit.com/chat/v1/rooms/asd
    Method: GET
    Parameters: - roomId : string
    Description: 
*/
module.exports = async function getRoomByIdMessages(roomId, body) {
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

  let bodyMessage = {
    body: `${body}`
  }

  console.log(url);

  //try catch to make the call via axios
  try {
    let response = await axios.post(url, bodyMessage, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
};
