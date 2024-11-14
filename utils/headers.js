<<<<<<< HEAD
// headers.js - Configure headers for FACEIT API requests

/**
 * Generate headers for FACEIT API requests
 * @param {string} apiKey - FACEIT API key for Data API authentication
 * @returns {Object} Headers configuration object
 */
export default function getHeaders(apiKey) {
  return {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Generate headers for FACEIT Chat API requests
 * @param {string} accessToken - OAuth2 access token
 * @returns {Object} Headers configuration object
 */
export function getChatHeaders(accessToken) {
  if (!accessToken) {
    throw new Error('No access token available');
  }

  return {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };
}
=======
export default function getHeaders(apiKey) {
    let headers = {
      accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  
  return headers;
}
>>>>>>> 64af7b0f66e5538bb146a4a95d447196292e1b98
