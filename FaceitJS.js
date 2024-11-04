// FaceitJS.js

// ***** IMPORTS ***** //

// CHAMPIONSHIPS
import getChampionshipsById from './endpoints/championships/getChampionshipsById.js';

// ***** FACEITJS CLASS ***** //

class FaceitJS {
  constructor(apiKeyServerSide, apiKeyClientSide) {
    this.apiKeyServer = apiKeyServerSide;
    this.apiKeyClient = apiKeyClientSide;
  }

  getApiKeyServer() {
    return this.apiKeyServer;
  }

  setApiKeyServer(apiKeyServerSide) {
    this.apiKeyServer = apiKeyServerSide;
  }

  getApiKeyClient() {
    return this.apiKeyClient;
  }

  setApiKeyClient(apiKeyClientSide) {
    this.apiKeyClient = apiKeyClientSide;
  }

  getHeader() {
    return {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${this.apiKeyServer}`,
      },
    };
  }
}

// ***** ADD PROTOTYPE METHODS ***** //

// CHAMPIONSHIPS
FaceitJS.prototype.getChampionshipsById = getChampionshipsById;
FaceitJS.prototype.championshipsById = getChampionshipsById;

// ***** EXPORT THE FACEITJS CLASS ***** //

export default FaceitJS;
