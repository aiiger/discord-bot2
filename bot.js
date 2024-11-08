require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const session = require('express-session');

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

// Generate a random string for state and nonce
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex');
}

// Authentication route
app.get('/auth', (req, res) => {
  const state = generateRandomString(16);
  const nonce = generateRandomString(16);
  const authorizationUrl = new URL(process.env.AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.append('response_type', 'code');
  authorizationUrl.searchParams.append('scope', process.env.SCOPE);
  authorizationUrl.searchParams.append('client_id', process.env.CLIENT_ID);
  authorizationUrl.searchParams.append('redirect_uri', process.env.REDIRECT_URI);
  authorizationUrl.searchParams.append('state', state);
  authorizationUrl.searchParams.append('nonce', nonce);

  // Store state and nonce in session
  req.session.state = state;
  req.session.nonce = nonce;

  res.redirect(authorizationUrl.toString());
});

// Callback route
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Verify state parameter
  if (state !== req.session.state) {
    return res.status(400).send('Invalid state parameter');
  }

  // Exchange authorization code for tokens
  try {
    const response = await axios.post(process.env.TOKEN_ENDPOINT, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    });
    const { access_token, id_token, refresh_token } = response.data;

    // Store tokens in session
    req.session.accessToken = access_token;
    req.session.idToken = id_token;
    req.session.refreshToken = refresh_token;

    res.redirect('/dashboard');
  } catch (error) {
    res.status(500).send('Error exchanging authorization code for tokens');
  }
});

// Protected route
app.get('/dashboard', async (req, res) => {
  const { accessToken } = req.session;
  if (!accessToken) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const response = await axios.get('https://api.faceit.com/dashboard', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).send('Error fetching dashboard data');
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
