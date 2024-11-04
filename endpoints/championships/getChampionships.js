import axios from "axios";
import urlConstructorUtil from "../../utils/urlConstructor.js";
import getHeaders from "../../utils/headers.js";
/*
    Uses url https://open.faceit.com/data/v4/championships
    Method: GET
    Parameters: 
    Description: 
*/
export default async function getChampionships(
  gameId,
  type,
  offset = 0,
  limit = 20
) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/championships";

  let searchOptions = {
    offset: offset,
    limit: limit,
  };

  //get url
  let url = urlConstructorUtil(
    baseURL,
    [],
    [],
    ["game", "type"],
    [gameId, type],
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
