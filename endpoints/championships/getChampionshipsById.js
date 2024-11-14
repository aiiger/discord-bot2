<<<<<<< HEAD
const axios = require("axios");
const urlConstructorUtil = require('../../utils/urlConstructor.js');
const getHeaders = require('../../utils/headers.js');
=======
import axios from "axios";
import urlConstructorUtil from '../../utils/urlConstructor.js';
import getHeaders from '../../utils/headers.js';
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
/*
    Uses url https://open.faceit.com/data/v4/championships
    Method: GET
    Parameters: - championshipId : string
                - expanded : Array        -> possible values: --(nothing),organizer, game.
    Description: 
*/
<<<<<<< HEAD
module.exports = async function getChampionshipsById(championshipId, expanded) {
=======
export default async function getChampionshipsById(championshipId, expanded) {
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
    //verify if expanded is an array
    if(!Array.isArray(expanded)){
        return new Error('Be sure that second argument is an array.');
    }

  let apiKey = this.getApiKeyServer();
  let headers = getHeaders(apiKey);

  let baseURL = "https://open.faceit.com/data/v4/championships";

  //get url
  let url = urlConstructorUtil(baseURL, [''], [championshipId], ['expanded'], [expanded], {});

  //try catch to make the call via axios
  try {
    let response = await axios.get(
      url,
      headers
    );
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
