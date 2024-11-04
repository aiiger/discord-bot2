# FACEIT Bot

A bot for managing FACEIT championships and hubs, with rehost and cancel functionality.

## Prerequisites

1. FACEIT Account
   - You need a FACEIT account to use this bot
   - If you don't have one, create it at https://www.faceit.com/signup

2. FACEIT Application Setup
   1. Go to https://developers.faceit.com/
   2. Log in with your FACEIT account
   3. Create a new application:
      - Go to "Applications" > "Create Application"
      - Fill in the application details:
        * Name: Your bot name
        * Description: Brief description of your bot
        * Redirect URI: Your Heroku app URL + /callback
        * Example: https://your-app-name.herokuapp.com/callback
      - Required OAuth2 scopes:
        * openid
        * email
        * profile
   4. After creation, you'll get:
      - Client ID
      - Client Secret
      - API Key
   5. Save these credentials for the next step

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

4. Fill in your environment variables in `.env`:
```env
# API Keys (from FACEIT Developer Portal)
FACEIT_API_KEY_SERVER=your_api_key_here
FACEIT_API_KEY_CLIENT=your_api_key_here
FACEIT_CLIENT_ID=your_client_id_here
FACEIT_CLIENT_SECRET=your_client_secret_here

# OAuth2 Configuration
# Must be your Heroku app URL + /callback
REDIRECT_URI=https://your-app-name.herokuapp.com/callback

# Session Security
SESSION_SECRET=your_random_secret_here

# Environment (production for Heroku)
NODE_ENV=production
```

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

### Hub Management
- `GET /hub/:hubId`: Get hub information
  - URL parameter: hubId (string)
  - Requires authentication
  - Returns hub details including:
    * Name
    * Description
    * Game
    * Members count
    * Current matches
    * Rules

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
heroku config:set REDIRECT_URI=https://your-app-name.herokuapp.com/callback
```

3. Deploy to Heroku:
```bash
git push heroku main
```

4. Ensure at least one dyno is running:
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
  - Hub operation errors
- System errors
  - Missing environment variables
  - Server errors

## Production Configuration

The bot is configured for production use on Heroku:

1. Security:
   - Secure cookies enabled
   - HTTPS enforced
   - Environment variables required
   - Session protection

2. Monitoring:
   - Health check endpoint
   - Error logging
   - Graceful shutdown

3. Authentication:
   - OAuth2 flow with CSRF protection
   - Session management
   - Token handling

## Example API Usage

### Get Hub Information
```bash
curl -X GET \
  https://your-app-name.herokuapp.com/hub/your-hub-id \
  -H 'Authorization: Bearer your-access-token'
```

### Rehost Championship
```bash
curl -X POST \
  https://your-app-name.herokuapp.com/rehost \
  -H 'Authorization: Bearer your-access-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "your-game-id",
    "eventId": "your-event-id"
  }'
```

### Cancel Championship
```bash
curl -X POST \
  https://your-app-name.herokuapp.com/cancel \
  -H 'Authorization: Bearer your-access-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "your-event-id"
  }'
