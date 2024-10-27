//Function to make the url to be sent the request, and return the url
module.exports = function urlConstructor(
  baseURL,
  midParametersArgs,
  midParametersValues,
  arrArgs,
  arrArgsValues,
  searchOptions
) {
  var url = baseURL;
  let questionMarkUsed = false;

  if (midParametersArgs.length > 0) {
    //has midParameters
    for (let i = 0; i < midParametersArgs.length; i++) {
      if (midParametersValues[i] !== "") {
        //If the mid argument has value
        if (midParametersArgs[i] === "") {
          //if it's an id, don't have the argument name
          url = url + "/" + midParametersValues[i];
          continue;
        }

        url = url + "/" + midParametersArgs[i] + "/" + midParametersValues[i];
        continue;
      }

      url = url + "/" + midParametersArgs[i];
    }
  }

  if (arrArgs.length > 0) {
    for (let i = 0; i < arrArgs.length; i++) {
      if(Array.isArray(arrArgsValues[i])){//if it is an array
        if(arrArgsValues[i].length === 0){//if the array has nothing
          continue;
        }

        if(!questionMarkUsed){//if the question marked is not used
          url = url + "?" + arrArgs[i] + '=';//put the name in the url
          for(let j = 0; j < arrArgsValues[i].length; j++){
            if(j === 0){
              url = url + arrArgsValues[i][j];
              continue;
            }
            url = url + ',' + arrArgsValues[i][j];
          }

          continue;
        }
      }
      

      if (
        !questionMarkUsed &&
        (arrArgsValues[i] !== "")
      ) {
        url = url + "?" + arrArgs[i] + "=" + arrArgsValues[i];
        questionMarkUsed = true;
        continue;
      }

      if (arrArgsValues[i] !== "") {
        url = url + "&" + arrArgs[i] + "=" + arrArgsValues[i];
      }
    }
  }

  if (Object.keys(searchOptions).length > 0) {
    let keys = Object.keys(searchOptions);
    let values = Object.values(searchOptions);
    for (let i = 0; i < Object.keys(searchOptions).length; i++) {
      if (!questionMarkUsed) {
        url = url + "?" + keys[i] + "=" + values[i];
        questionMarkUsed = true;
        continue;
      }

      url = url + "&" + keys[i] + "=" + values[i];
    }
  }

  return url;
};
