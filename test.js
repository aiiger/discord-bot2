// test.js

import getChampionships from './endpoints/championships/getChampionships.js';

class TestFaceitJS {
  getApiKeyServer() {
    return 'your_api_key_here';
  }
}

const testInstance = new TestFaceitJS();

(async () => {
  try {
    const championships = await getChampionships.call(testInstance, 'game123', 'typeA', 0, 10);
    console.log(championships);
  } catch (error) {
    console.error('Error:', error);
  }
})();