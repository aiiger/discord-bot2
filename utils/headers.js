module.exports = function getHeaders(apiKey){
    let headers = {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
  
  return headers;
}