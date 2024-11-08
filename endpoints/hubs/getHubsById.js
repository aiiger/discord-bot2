import axios from "axios";
import urlConstructorUtil from "../../utils/urlConstructor.js";
import getHeaders from "../../utils/headers.js";

export default async function getHubsById(hubId) {
  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/hubs";

  //get url
  let url = urlConstructorUtil(baseURL, [""], [hubId], [], [], {});

  //try catch to make the call via axios
  try {
    let response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    //console.error(err.response.data)
    return new Error(err.response.data);
  }
}
