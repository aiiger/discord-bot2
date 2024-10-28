import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Force HTTPS in production - must be first middleware
app.enable('trust proxy');
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
});

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
    secure: process.env.NODE_ENV === 'production', // Only send cookies over HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  },
  proxy: true // Trust the reverse proxy
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

// HTML template function
function renderHTML(title, content) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1, h2 {
            color: #333;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 10px;
          }
          .button:hover {
            background-color: #0056b3;
          }
          .error {
            color: #dc3545;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
        </div>
      </body>
    </html>
  `;
}

// Middleware to disable caching and add security headers
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  next();
});

// Basic favicon response to prevent 404s
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
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
    res.send(renderHTML('Health Check', `
      <h1>System Status</h1>
      <p>Bot is running and MongoDB connection is healthy</p>
      <a href="/" class="button">Return Home</a>
    `));
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).send(renderHTML('Health Check Failed', `
      <h1>System Status</h1>
      <p class="error">Bot is running but MongoDB connection failed: ${error.message}</p>
      <a href="/" class="button">Return Home</a>
    `));
  }
});

// Step 2: Redirect to Faceit OAuth2 Authorization URL
app.get('/', (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store codeVerifier in session
    req.session.codeVerifier = codeVerifier;
    
    // Generate and store state parameter
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const faceitAuthUrl = `https://accounts.faceit.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;

    console.log("Redirecting to Faceit Auth URL:", faceitAuthUrl);

    res.redirect(faceitAuthUrl);
  } catch (error) {
    console.error('Error initiating OAuth flow:', error);
    res.status(500).send(renderHTML('Authentication Error', `
      <h1>Authentication Error</h1>
      <p class="error">Failed to initiate authentication. Please try again.</p>
      <p class="error">Error: ${error.message}</p>
      <a href="/" class="button">Try Again</a>
    `));
  }
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res) => {
  console.log("Received query parameters:", req.query);

  // Check for direct access without authentication
  if (!req.session.codeVerifier || !req.session.oauthState) {
    return res.status(400).send(renderHTML('Authentication Required', `
      <h1>Authentication Required</h1>
      <p>Please start the authentication process from the beginning.</p>
      <p class="error">Session information is missing. This could happen if you accessed this page directly or if your session has expired.</p>
      <a href="/" class="button">Start Authentication</a>
    `));
  }

  // Check for error response from OAuth provider
  if (req.query.error) {
    console.error('OAuth error:', req.query.error);
    return res.status(400).send(renderHTML('Authentication Failed', `
      <h1>Authentication Failed</h1>
      <p class="error">${req.query.error_description || req.query.error}</p>
      <a href="/" class="button">Try Again</a>
    `));
  }

  // Check for missing state parameter
  if (!req.query.state) {
    console.error('Missing state parameter in callback');
    return res.status(400).send(renderHTML('Security Error', `
      <h1>Security Error</h1>
      <p class="error">Missing state parameter. This could be a security risk.</p>
      <a href="/" class="button">Start Over</a>
    `));
  }

  // Verify state parameter
  if (req.query.state !== req.session.oauthState) {
    console.error('State mismatch:', req.query.state, 'vs', req.session.oauthState);
    return res.status(400).send(renderHTML('Security Error', `
      <h1>Security Error</h1>
      <p class="error">Invalid state parameter. This could be a security risk or your session may have expired.</p>
      <a href="/" class="button">Start Over</a>
    `));
  }

  const code = req.query.code;
  const codeVerifier = req.session.codeVerifier;

  if (!code) {
    console.log("No authorization code found.");
    return res.status(400).send(renderHTML('Authentication Error', `
      <h1>Authentication Error</h1>
      <p class="error">No authorization code found. Please try logging in again.</p>
      <a href="/" class="button">Return to Login</a>
    `));
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

    // Store the access token in session
    req.session.accessToken = accessToken;
    
    // Clear OAuth state and verifier
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.send(renderHTML('Authentication Successful', `
      <h1>Authentication Successful</h1>
      <p>You have been successfully authenticated!</p>
      <p>You can now use the API endpoints.</p>
      <a href="/api" class="button">View Active Matches</a>
    `));
  } catch (error) {
    console.error("Failed to fetch access token:", error.response?.data || error.message);
    res.status(500).send(renderHTML('Authentication Failed', `
      <h1>Authentication Failed</h1>
      <p class="error">Failed to complete authentication. Please try again.</p>
      <p class="error">Error: ${error.response?.data?.error_description || error.message}</p>
      <a href="/" class="button">Return to Login</a>
    `));
  }
});

// Example of making an authenticated API call
app.get('/api', async (req, res) => {
  // First check session token
  const sessionToken = req.session.accessToken;
  if (sessionToken) {
    accessToken = sessionToken;
  }

  if (!accessToken) {
    return res.status(401).send(renderHTML('Authentication Required', `
      <h1>Authentication Required</h1>
      <p class="error">Please log in to access this feature.</p>
      <a href="/" class="button">Login</a>
    `));
  }

  try {
    const activeMatches = await axios.get(`https://open.faceit.com/data/v4/hubs/${hubId}/matches`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Format the matches data for display
    const matches = activeMatches.data;
    const matchesList = Array.isArray(matches) ? matches.map(match => `
      <div class="match">
        <h3>Match ID: ${match.match_id}</h3>
        <p>Status: ${match.status}</p>
      </div>
    `).join('') : '<p>No active matches found.</p>';

    res.send(renderHTML('Active Matches', `
      <h1>Active Matches</h1>
      ${matchesList}
      <a href="/api" class="button">Refresh</a>
      <a href="/" class="button">Home</a>
    `));
  } catch (error) {
    console.error("Failed to fetch data:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      // Clear invalid token
      delete req.session.accessToken;
      accessToken = null;
      return res.status(401).send(renderHTML('Session Expired', `
        <h1>Session Expired</h1>
        <p class="error">Your session has expired. Please log in again.</p>
        <a href="/" class="button">Login</a>
      `));
    }
    res.status(500).send(renderHTML('Error', `
      <h1>Error</h1>
      <p class="error">Failed to fetch data. Please try again.</p>
      <a href="/api" class="button">Retry</a>
      <a href="/" class="button">Home</a>
    `));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send(renderHTML('Error', `
    <h1>Error</h1>
    <p class="error">Something went wrong! Please try again.</p>
    <p class="error">Error: ${err.message}</p>
    <a href="/" class="button">Return Home</a>
  `));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Configured' : 'Missing');
  console.log('Environment:', process.env.NODE_ENV || 'development');
});
