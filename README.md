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

4. Fill in your environment variables in `.env`

## Development

Run the bot locally:
```bash
npm start
```

## Deployment to Heroku

1. Create a new Heroku app:
```bash
heroku create your-app-name
```

2. Set environment variables on Heroku:
```bash
heroku config:set FACEIT_API_KEY_SERVER=your_server_api_key_here
heroku config:set FACEIT_API_KEY_CLIENT=your_client_api_key_here
heroku config:set FACEIT_CLIENT_ID=your_client_id_here
heroku config:set FACEIT_CLIENT_SECRET=your_client_secret_here
heroku config:set REDIRECT_URI=https://your-app-name.herokuapp.com/callback
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

## Environment Variables

- `FACEIT_API_KEY_SERVER`: Your FACEIT API server key
- `FACEIT_API_KEY_CLIENT`: Your FACEIT API client key
- `FACEIT_CLIENT_ID`: OAuth2 client ID from FACEIT
- `FACEIT_CLIENT_SECRET`: OAuth2 client secret from FACEIT
- `REDIRECT_URI`: OAuth2 callback URL (e.g., https://your-app-name.herokuapp.com/callback)
- `SESSION_SECRET`: Secret for session encryption
- `NODE_ENV`: Set to 'production' for deployment

## API Endpoints

- `GET /`: Redirects to authentication
- `GET /auth`: Initiates FACEIT OAuth2 authentication
- `GET /callback`: OAuth2 callback handler
- `GET /dashboard`: User dashboard
- `POST /rehost`: Rehost a championship
  - Required body: `{ "gameId": "string", "eventId": "string" }`
- `POST /cancel`: Cancel a championship
  - Required body: `{ "eventId": "string" }`
- `GET /health`: Health check endpoint

## Error Handling

The bot includes comprehensive error handling:
- Environment variable validation
- Authentication error handling
- API error handling
- Graceful shutdown handling

## Security Features

- Secure session configuration
- CSRF protection
- HTTP-only cookies
- Environment variable validation
- Production security settings
