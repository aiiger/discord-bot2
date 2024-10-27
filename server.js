// server.js

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Faceit Bot is running.');
});

app.get('/callback', (req, res) => {
  res.send('Callback received.');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
app.get('/callback', async (req, res) => {
    const authorizationCode = req.query.code;
  
    if (!authorizationCode) {
      return res.status(400).send("No authorization code found in the query parameters.");
    }
  
    // Exchange the authorization code for an access token
    try {
      const response = await axios.post('https://accounts.faceit.com/oauth/token', {
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.FACEIT_CLIENT_ID,
        client_secret: process.env.FACEIT_CLIENT_SECRET,
      });
  
      const accessToken = response.data.access_token;
      // Store the access token for further API requests
      // Redirect or respond based on your application flow
      res.send("Authorization successful!");
    } catch (error) {
      res.status(500).send("Error exchanging authorization code for access token.");
    }
  });
  