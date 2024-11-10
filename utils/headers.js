export default function getHeaders(apiKey) {
  return {
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
}
