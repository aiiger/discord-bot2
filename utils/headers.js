// headers.js - Utility for constructing request headers
export default function getHeaders(apiKey) {
  return {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
}
