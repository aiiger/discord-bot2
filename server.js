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
