# FACEIT Bot

A bot for managing FACEIT championships and hubs, with rehost and cancel functionality.

## Features

- Client Credentials authentication with FACEIT
- Championship management commands:
  - Rehost championships
  - Cancel championships
- Hub information retrieval
- Production-ready configuration

## Prerequisites

1. FACEIT Developer Account
   - Go to https://developers.faceit.com/
   - Create a new application
   - Get your API keys and client credentials

2. Required Credentials:
   - API Key (Server)
   - API Key (Client)
   - Client ID
   - Client Secret

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
# API Keys from FACEIT Developer Portal
FACEIT_API_KEY_SERVER=your_server_api_key_here
FACEIT_API_KEY_CLIENT=your_client_api_key_here

# OAuth2 Client Credentials
FACEIT_CLIENT_ID=your_client_id_here
FACEIT_CLIENT_SECRET=your_client_secret_here

# Session Security
SESSION_SECRET=your_random_secret_here

# Environment
NODE_ENV=production
```

## API Endpoints

### Hub Management
- `GET /api/hubs/:hubId`: Get hub information
  - URL parameter: hubId (string)
  - Returns hub details

### Hub Management
- `GET /api/hubs/:hubId`: Get hub information
  - URL parameter: hubId (string)
  - Requires authentication
  - Returns hub details

### Championship Management
- `POST /api/championships/rehost`: Rehost a championship
  - Required body: `{ "gameId": "string", "eventId": "string" }`
  
- `POST /api/championships/cancel`: Cancel a championship
  - Required body: `{ "eventId": "string" }`
<<<<<<< HEAD
  - Requires authentication
=======
>>>>>>> fd6eabfd3114f4e6055340ee7ea728d6f46f4340

### System
- `GET /health`: Health check endpoint

## Example API Usage

### Get Hub Information
```bash
curl -X GET \
  https://your-app-name.herokuapp.com/api/hubs/your-hub-id
```

### Rehost Championship
```bash
curl -X POST \
  https://your-app-name.herokuapp.com/api/championships/rehost \
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
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "your-event-id"
  }'
```

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

3. Deploy to Heroku:
```bash
git push heroku main
```

4. Ensure at least one dyno is running:
```bash
heroku ps:scale web=1
```

## Authentication

<<<<<<< HEAD
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
=======
The bot uses FACEIT's Client Credentials flow for authentication:

1. Automatic token management:
   - Tokens are automatically obtained when needed
   - Tokens are stored in the session
   - Tokens are refreshed when expired

2. Security features:
   - Secure session configuration
   - HTTP-only cookies
   - Environment variable validation
>>>>>>> fd6eabfd3114f4e6055340ee7ea728d6f46f4340

## Error Responses

All API endpoints return consistent error responses:

```json
{
  "error": "Error Type",
  "message": "Human readable error message"
}
```

Common error types:
<<<<<<< HEAD
- Unauthorized: Not logged in
=======
- Authentication Error: Failed to authenticate with FACEIT
>>>>>>> fd6eabfd3114f4e6055340ee7ea728d6f46f4340
- Bad Request: Missing required parameters
- Internal Server Error: Server-side issues

## Production Notes

<<<<<<< HEAD
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
=======
1. Security:
   - All cookies are secure-only in production
   - Session data is encrypted
   - Environment variables are validated

2. Monitoring:
   - Health check endpoint
   - Error logging
   - Graceful shutdown handling

3. API Structure:
   - All endpoints under /api prefix
   - Consistent error responses
>>>>>>> fd6eabfd3114f4e6055340ee7ea728d6f46f4340
   - JSON responses for all API calls
