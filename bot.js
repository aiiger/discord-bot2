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
    res.send('Bot is running and MongoDB connection is healthy');
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).send(`Bot is running but MongoDB connection failed: ${error.message}`);
  }
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
    console.error('Error initiating OAuth flow:', error);
    res.status(500).send('Failed to initiate authentication. Please try again.');
  }
});

// Step 3: Handle OAuth2 Callback and Exchange Code for Access Token
app.get('/callback', async (req, res) => {
  console.log("Received query parameters:", req.query);

  // Check for error response from OAuth provider
  if (req.query.error) {
    console.error('OAuth error:', req.query.error);
    return res.status(400).send(`Authentication failed: ${req.query.error_description || req.query.error}`);
  }

  const code = req.query.code;
  const codeVerifier = req.session.codeVerifier;

  if (!code) {
    console.log("No authorization code found.");
    return res.status(400).send(`
      <html>
        <body>
          <h2>Authentication Error</h2>
          <p>No authorization code found. Please try logging in again.</p>
          <a href="/">Return to Login</a>
        </body>
      </html>
    `);
  }

  if (!codeVerifier) {
    console.log("No code verifier found in session.");
    return res.status(400).send(`
      <html>
        <body>
          <h2>Session Expired</h2>
          <p>Your session has expired. Please try logging in again.</p>
          <a href="/">Return to Login</a>
        </body>
      </html>
    `);
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

    res.send(`
      <html>
        <body>
          <h2>Authentication Successful</h2>
          <p>You have been successfully authenticated!</p>
          <p>You can now use the API endpoints.</p>
          <a href="/api">View Active Matches</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Failed to fetch access token:", error.response?.data || error.message);
    res.status(500).send(`
      <html>
        <body>
          <h2>Authentication Failed</h2>
          <p>Failed to complete authentication. Please try again.</p>
          <p>Error: ${error.response?.data?.error_description || error.message}</p>
          <a href="/">Return to Login</a>
        </body>
      </html>
    `);
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
    return res.status(401).send(`
      <html>
        <body>
          <h2>Authentication Required</h2>
          <p>Please log in to access this feature.</p>
          <a href="/">Login</a>
        </body>
      </html>
    `);
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
    if (error.response?.status === 401) {
      // Clear invalid token
      delete req.session.accessToken;
      accessToken = null;
      return res.status(401).send(`
        <html>
          <body>
            <h2>Session Expired</h2>
            <p>Your session has expired. Please log in again.</p>
            <a href="/">Login</a>
          </body>
        </html>
      `);
    }
    res.status(500).send(`
      <html>
        <body>
          <h2>Error</h2>
          <p>Failed to fetch data. Please try again.</p>
          <a href="/api">Retry</a>
        </body>
      </html>
    `);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send(`
    <html>
      <body>
        <h2>Error</h2>
        <p>Something went wrong! Please try again.</p>
        <p>Error: ${err.message}</p>
        <a href="/">Return Home</a>
      </body>
    </html>
  `);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Configured' : 'Missing');
  console.log('Environment:', process.env.NODE_ENV || 'development');
});
