const axios = require('axios');

const apiKey = process.env.API_KEY;

axios.get('https://api.example.com/data', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
})
.then(response => {
    console.log(response.data);
})
.catch(error => {
    if (error.response && error.response.status === 401) {
        console.error('Unauthorized: Check your API credentials');
    } else {
        console.error('An error occurred:', error.message);
    }
});