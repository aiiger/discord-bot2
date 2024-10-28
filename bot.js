import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Verify required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'FACEIT_CLIENT_ID',
  'FACEIT_CLIENT_SECRET',
  'REDIRECT_URI',
  'FACEIT_HUB_ID',
  'SESSION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Session configuration with MongoStore
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // Session TTL (1 day)
    autoRemove: 'native', // Enable automatic removal of expired sessions
    touchAfter: 24 * 3600 // Only update session once per day unless data changes
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
};

// Use secure cookies in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// Environment Variables
const clientId = process.env.FACEIT_CLIENT_ID;
const clientSecret = process.env.FACEIT_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.send('Bot is running');
});

// Step 2: Redirect to Faceit OAuth2 Authorization URL
app.get('/', (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store codeVerifier in session
    req.session.codeVerifier = codeVerifier;

    const faceitAuthUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    console.log("Redirecting to Faceit Auth URL:", faceitAuthUrl);
    res.redirect(faceitAuthUrl);
  } catch (error) {
    console.error("Error in authorization initiation:", error);
    res.status(500).send("Error initiating authorization process");
  }
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res, next) => {
  console.log("Received query parameters:", req.query);

  try {
    const code = req.query.code;
    const codeVerifier = req.session?.codeVerifier;

    if (!code) {
      console.log("No authorization code found.");
      return res.status(400).send("No authorization code found. Please try logging in again.");
    }

    if (!codeVerifier) {
      console.log("No code verifier found in session.");
      return res.status(400).send("Session expired. Please try logging in again.");
    }

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
    // Pass error to error handling middleware instead of sending response directly
    next(error);
  }
});

// Example of making an authenticated API call
app.get('/api', async (req, res, next) => {
  try {
    if (!accessToken) {
      return res.status(401).send("No access token available. Please authenticate first.");
    }

    const activeMatches = await axios.get(`https://open.faceit.com/data/v4/hubs/${hubId}/matches`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(activeMatches.data);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error occurred:", err);
  
  // Handle Axios errors
  if (err.response) {
    return res.status(err.response.status).json({
      error: "External API Error",
      message: err.response.data?.message || "Error communicating with external service",
      status: err.response.status
    });
  }
  
  // Handle MongoDB connection errors
  if (err.name === "MongoServerSelectionError") {
    return res.status(500).json({
      error: "Database Connection Error",
      message: "Unable to connect to database"
    });
  }

  // Default error response
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'production' ? 
      "An unexpected error occurred" : 
      err.message
  });
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
