// endpoints/championships/getChampionships.js

import axios from 'axios';
import urlConstructorUtil from '../../utils/urlConstructor.js';
import getHeaders from '../../utils/headers.js';

/*
    Uses URL: https://open.faceit.com/data/v4/championships
    Method: GET
    Parameters:
      - gameId: string (optional)
      - type: string (optional)
      - offset: number (default: 0)
      - limit: number (default: 20)
    Description: Fetches a list of championships based on provided parameters.
*/

const getChampionships = async function (
  gameId,
  type,
  offset = 0,
  limit = 20
) {
  try {
    const apiKey = this.getApiKeyServer();
    const headers = getHeaders(apiKey);

    const baseURL = 'https://open.faceit.com/data/v4/championships';

    const searchOptions = {
      offset,
      limit,
    };

    // Construct URL with query parameters
    const url = urlConstructorUtil(
      baseURL,
      [],
      [],
      ['game', 'type'],
      [gameId, type],
      searchOptions
    );

    // Make the API call via axios
    const response = await axios.get(url, headers);
    return response.data;
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
    throw new Error(err.response ? err.response.data : 'Unknown error');
  }
};

export default getChampionships;
