import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// MongoDB connection options
const mongoConfig = {
  mongoUrl: process.env.MONGODB_URI,
  ttl: 24 * 60 * 60, // Session TTL (1 day)
  autoRemove: 'native',
  crypto: {
    secret: process.env.SESSION_SECRET
  },
  connectionOptions: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  }
};

// Session configuration with MongoStore
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create(mongoConfig),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Environment Variables
const clientId = process.env.FACEIT_CLIENT_ID;
const clientSecret = process.env.FACEIT_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI || 'https://meslx-13b51d23300b.herokuapp.com/callback';
const hubId = process.env.FACEIT_HUB_ID;

let accessToken; // Declare globally

// Helper functions
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

// Middleware to disable caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Health check endpoint with MongoDB connection status
app.get('/health', async (req, res) => {
  try {
    // Test the session store connection
    await new Promise((resolve, reject) => {
      req.session.test = 'test';
      req.session.save((err) => {
        if (err) reject(err);
        resolve();
      });
    });
    res.send('Bot is running and MongoDB connection is healthy');
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).send(`Bot is running but MongoDB connection failed: ${error.message}`);
  }
});

// Step 2: Redirect to Faceit OAuth2 Authorization URL
app.get('/', (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store codeVerifier in session
  req.session.codeVerifier = codeVerifier;

  const faceitAuthUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  console.log("Redirecting to Faceit Auth URL:", faceitAuthUrl);

  res.redirect(faceitAuthUrl);
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res) => {
  console.log("Received query parameters:", req.query);

  const code = req.query.code;
  const codeVerifier = req.session.codeVerifier;

  if (!code) {
    console.log("No authorization code found.");
    res.status(400).send("No authorization code found. Please try logging in again.");
    return;
  }

  if (!codeVerifier) {
    console.log("No code verifier found in session.");
    res.status(400).send("Session expired. Please try logging in again.");
    return;
  }

  try {
    const tokenResponse = await axios.post('https://accounts.faceit.com/oauth/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    accessToken = tokenResponse.data.access_token;
    console.log("Access Token received successfully");

    res.send("Authenticated successfully! Access token received.");
  } catch (error) {
    console.error("Failed to fetch access token:", error.response?.data || error.message);
    res.status(500).send(`Failed to authenticate. Error: ${JSON.stringify(error.response?.data || error.message)}`);
  }
});

// Example of making an authenticated API call
app.get('/api', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send("No access token available. Please authenticate first.");
  }

  try {
    const activeMatches = await axios.get(`https://open.faceit.com/data/v4/hubs/${hubId}/matches`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(activeMatches.data);
  } catch (error) {
    console.error("Failed to fetch data:", error.response?.data || error.message);
    res.status(500).send("Error fetching data. Make sure the bot is authenticated.");
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Something broke! Error: ' + err.message);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Configured' : 'Missing');
});
