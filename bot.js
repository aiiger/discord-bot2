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
        <title>${title} - FACEIT Bot</title>
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
            margin-bottom: 20px;
          }
          p {
            margin-bottom: 15px;
            color: #666;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #FF5500;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 15px;
            transition: background-color 0.3s ease;
          }
          .button:hover {
            background-color: #E64D00;
          }
          .error {
            color: #dc3545;
            padding: 10px;
            background-color: #fff5f5;
            border-radius: 4px;
            margin: 10px 0;
          }
          .info {
            color: #0066cc;
            padding: 10px;
            background-color: #f0f7ff;
            border-radius: 4px;
            margin: 10px 0;
          }
          .match {
            border: 1px solid #ddd;
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .match h3 {
            margin: 0 0 10px 0;
            color: #333;
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
    res.send(renderHTML('System Status', `
      <h1>System Status</h1>
      <p class="info">Bot is running and MongoDB connection is healthy</p>
      <a href="/" class="button">Return Home</a>
    `));
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).send(renderHTML('System Status', `
      <h1>System Status</h1>
      <p class="error">Bot is running but MongoDB connection failed: ${error.message}</p>
      <a href="/" class="button">Return Home</a>
    `));
  }
});

// Home page with authentication start
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

    console.log("Generated FACEIT authentication URL");

    res.send(renderHTML('Welcome', `
      <h1>Welcome to FACEIT Bot</h1>
      <p>This application allows you to interact with FACEIT services. To get started, you'll need to authenticate with your FACEIT account.</p>
      <div class="info">
        <p>By clicking the login button, you'll be redirected to FACEIT's secure authentication page.</p>
      </div>
      <a href="${faceitAuthUrl}" class="button">Login with FACEIT</a>
    `));
  } catch (error) {
    console.error('Error preparing authentication:', error);
    res.status(500).send(renderHTML('Error', `
      <h1>Authentication Error</h1>
      <p class="error">Failed to prepare authentication. Please try again.</p>
      <p class="error">Error: ${error.message}</p>
      <a href="/" class="button">Try Again</a>
    `));
  }
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res) => {
  console.log("Received callback request");

  // If accessed directly without any parameters, redirect to home
  if (Object.keys(req.query).length === 0) {
    console.log("Callback accessed directly - redirecting to home");
    return res.redirect('/');
  }

  // Check for direct access without authentication
  if (!req.session.codeVerifier || !req.session.oauthState) {
    console.log("No session data found - redirecting to home");
    return res.redirect('/');
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
    return res.redirect('/');
  }

  // Verify state parameter
  if (req.query.state !== req.session.oauthState) {
    console.error('State mismatch - redirecting to home');
    return res.redirect('/');
  }

  const code = req.query.code;
  const codeVerifier = req.session.codeVerifier;

  if (!code) {
    console.log("No authorization code found");
    return res.redirect('/');
  }

  try {
    console.log("Exchanging authorization code for access token");
    const tokenResponse = await axios.post('https://accounts.faceit.com/oauth/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    accessToken = tokenResponse.data.access_token;
    console.log("Access token received successfully");

    // Store the access token in session
    req.session.accessToken = accessToken;
    
    // Clear OAuth state and verifier
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.send(renderHTML('Authentication Successful', `
      <h1>Authentication Successful</h1>
      <p>You have been successfully authenticated with FACEIT!</p>
      <div class="info">
        <p>You can now access the FACEIT API features.</p>
      </div>
      <a href="/api" class="button">View Active Matches</a>
    `));
  } catch (error) {
    console.error("Token exchange failed:", error.response?.data || error.message);
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
    console.log("Fetching active matches");
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
      <div class="info">
        <p>This list shows all currently active matches in the hub.</p>
      </div>
      <a href="/api" class="button">Refresh</a>
      <a href="/" class="button">Home</a>
    `));
  } catch (error) {
    console.error("API request failed:", error.response?.data || error.message);
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
      <p class="error">Failed to fetch match data. Please try again.</p>
      <a href="/api" class="button">Retry</a>
      <a href="/" class="button">Home</a>
    `));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
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
