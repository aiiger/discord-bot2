export default function getHeaders(apiKey) {
    let headers = {
      accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  
  return headers;
}