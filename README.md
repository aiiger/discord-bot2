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

# Environment
NODE_ENV=production
```

## API Endpoints

### Authentication
- `GET /`: Login page
- `GET /auth`: Initiate FACEIT OAuth2 flow
- `GET /callback`: OAuth2 callback handler
- `GET /dashboard`: User dashboard
- `GET /logout`: Clear session and logout

### Hub Management
- `GET /api/hubs/:hubId`: Get hub information
  - URL parameter: hubId (string)
  - Requires authentication
  - Returns hub details

### Championship Management
- `POST /api/championships/rehost`: Rehost a championship
  - Required body: `{ "gameId": "string", "eventId": "string" }`
  - Requires authentication
  
- `POST /api/championships/cancel`: Cancel a championship
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
  - Secure cookies (HTTPS only)
  - Custom session name
- CSRF protection via state parameter
- Environment variable validation
- Production security settings
- Graceful shutdown handling

## Example API Usage

### Get Hub Information
```bash
curl -X GET \
  https://your-app-name.herokuapp.com/api/hubs/your-hub-id \
  -H 'Cookie: faceit.sid=your-session-cookie'
```

### Rehost Championship
```bash
curl -X POST \
  https://your-app-name.herokuapp.com/api/championships/rehost \
  -H 'Cookie: faceit.sid=your-session-cookie' \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "your-game-id",
    "eventId": "your-event-id"
  }'
```

### Cancel Championship
```bash
curl -X POST \
  https://your-app-name.herokuapp.com/api/championships/cancel \
  -H 'Cookie: faceit.sid=your-session-cookie' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "your-event-id"
  }'
```

## Error Responses

All API endpoints return consistent error responses:

```json
{
  "error": "Error Type",
  "message": "Human readable error message"
}
```

Common error types:
- Unauthorized: Not logged in
- Bad Request: Missing required parameters
- Internal Server Error: Server-side issues

## Production Notes

1. HTTPS Required
   - All cookies are secure-only
   - All communication must be over HTTPS

2. Authentication Flow
   - Login through FACEIT OAuth2
   - Session cookie used for subsequent requests
   - No localhost/development mode available

3. API Structure
   - All API endpoints under /api prefix
   - Authentication required for all endpoints
   - JSON responses for all API calls
