# FACEIT Bot

A bot for managing FACEIT championships, with rehost and cancel functionality.

## Features

- OAuth2 authentication with FACEIT
- Championship management commands:
  - Rehost championships
  - Cancel championships
- Secure session handling
- Production-ready configuration

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd discord-bot2
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Fill in your environment variables in `.env`. Required variables:
   - `FACEIT_API_KEY_SERVER`
   - `FACEIT_API_KEY_CLIENT`
   - `FACEIT_CLIENT_ID`
   - `FACEIT_CLIENT_SECRET`
   - `SESSION_SECRET`

   Optional variables:
   - `REDIRECT_URI` (defaults to http://localhost:3000/callback in development)
   - `NODE_ENV` (defaults to development)
   - `PORT` (defaults to 3000)

## Development

1. Start the bot:
```bash
npm start
```

2. Visit http://localhost:3000 in your browser
3. Click "Login with FACEIT" to test the OAuth flow
4. After successful authentication, you'll be redirected to the dashboard

## Testing OAuth Flow

The OAuth flow can be tested locally:

1. Ensure your FACEIT application is configured with:
   - Redirect URI: http://localhost:3000/callback
   - Required scopes: openid, email, profile

2. The flow consists of:
   - User clicks "Login with FACEIT"
   - User is redirected to FACEIT for authentication
   - After successful login, user is redirected back to /callback
   - User session is created and redirected to dashboard

## API Endpoints

### Authentication
- `GET /`: Login page
- `GET /auth`: Initiate FACEIT OAuth2 flow
- `GET /callback`: OAuth2 callback handler
- `GET /dashboard`: User dashboard
- `GET /logout`: Clear session and logout

### Championship Management
- `POST /rehost`: Rehost a championship
  - Required body: `{ "gameId": "string", "eventId": "string" }`
  - Requires authentication
  
- `POST /cancel`: Cancel a championship
  - Required body: `{ "eventId": "string" }`
  - Requires authentication

### System
- `GET /health`: Health check endpoint

## Deployment to Heroku

1. Create a new Heroku app:
```bash
heroku create your-app-name
```

2. Set required environment variables:
```bash
heroku config:set FACEIT_API_KEY_SERVER=your_server_api_key_here
heroku config:set FACEIT_API_KEY_CLIENT=your_client_api_key_here
heroku config:set FACEIT_CLIENT_ID=your_client_id_here
heroku config:set FACEIT_CLIENT_SECRET=your_client_secret_here
heroku config:set SESSION_SECRET=your_session_secret_here
heroku config:set NODE_ENV=production
```

3. Set the REDIRECT_URI to your Heroku app URL:
```bash
heroku config:set REDIRECT_URI=https://your-app-name.herokuapp.com/callback
```

4. Deploy to Heroku:
```bash
git push heroku main
```

5. Ensure at least one dyno is running:
```bash
heroku ps:scale web=1
```

## Security Features

- Secure session configuration
  - HTTP-only cookies
  - Secure in production
  - Custom session name
- CSRF protection via state parameter
- Environment variable validation
- Production security settings
- Graceful shutdown handling

## Error Handling

The application includes comprehensive error handling:

- OAuth2 flow errors
  - Missing code
  - Invalid state (CSRF protection)
  - Token exchange failures
- API errors
  - Authentication errors
  - Championship operation errors
- System errors
  - Missing environment variables
  - Server errors

## Development vs Production

The bot automatically adjusts its configuration based on the environment:

Development (default):
- Uses http://localhost:3000/callback as default redirect URI
- Session cookie secure flag disabled
- More verbose logging
- Detailed error messages

Production:
- Requires explicit REDIRECT_URI setting
- Session cookie secure flag enabled
- Production-optimized error handling
- Health check endpoint for monitoring
