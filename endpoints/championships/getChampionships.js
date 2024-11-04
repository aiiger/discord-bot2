// endpoints/championships/getChampionships.js

import axios from 'axios';
import urlConstructorUtil from '../../utils/urlConstructor.js';
import getHeaders from '../../utils/headers.js';

/*
    Uses URL: https://open.faceit.com/data/v4/championships
    Method: GET
    Parameters:
    Description:
*/

const getChampionships = async function (
  gameId,
  type,
  offset = 0,
  limit = 20
) {
  try {
    let apiKey = this.getApiKeyServer();
    let headers = getHeaders(apiKey);

    let baseURL = 'https://open.faceit.com/data/v4/championships';

    let searchOptions = {
      offset: offset,
      limit: limit,
    };

    // Construct URL
    let url = urlConstructorUtil(
      baseURL,
      [],
      [],
      ['game', 'type'],
      [gameId, type],
      searchOptions
    );

    // Make the API call via axios
    let response = await axios.get(url, { headers });
    return response.data;
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
    throw new Error(err.response ? err.response.data : 'Unknown error');
  }
};

export default getChampionships;
