# FACEIT Discord Bot

A Discord bot for monitoring FACEIT matches and managing chat interactions.

## Features

- Monitor FACEIT hub matches in real-time
- Send welcome messages when matches start
- Handle rehost votes (!rehost command)
- Check and handle match cancellations based on ELO difference (!cancel command)

## Prerequisites

- Node.js 16.9.0 or higher
- A Discord bot token
- FACEIT API credentials (API Key, Client ID, Client Secret)
- A FACEIT Hub ID
- A Heroku account

## FACEIT Application Setup

1. Go to the [FACEIT Developer Portal](https://developers.faceit.com/apps)
2. Create or select your application
3. In the OAuth2 Configuration section, enable the following scopes:
   - chat.messages.read
   - chat.messages.write
   - chat.rooms.read
4. Save your changes

## Deployment to Heroku

1. Create a new Heroku app:
   - Go to your [Heroku Dashboard](https://dashboard.heroku.com)
   - Click "New" > "Create new app"
   - Choose a unique app name
   - Click "Create app"

2. Configure environment variables in Heroku:
   - Go to your app's Settings tab
   - Click "Reveal Config Vars"
   - Add the following variables:
     ```
     DISCORD_TOKEN=your_discord_token
     FACEIT_API_KEY=your_faceit_api_key
     CLIENT_ID=your_faceit_client_id
     CLIENT_SECRET=your_faceit_client_secret
     HUB_ID=your_hub_id
     NODE_ENV=production
     REDIRECT_URI=https://your-app-name.herokuapp.com/callback
     SESSION_SECRET=your_session_secret
     ```

3. Deploy using GitHub:
   - Go to your app's Deploy tab
   - Choose GitHub as the deployment method
   - Connect to your GitHub repository
   - Choose the branch to deploy
   - Click "Deploy Branch"

4. Verify the deployment:
   - Click "Open app" to visit your application
   - Click "Link FACEIT Account" to authenticate
   - The bot should now be able to send chat messages in FACEIT matches

## Local Development

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `npm install`
4. Start the bot: `npm start`

Note: Local development requires configuring the FACEIT application to accept localhost as a redirect URI. For production, use the Heroku deployment.

## Troubleshooting

### Invalid Scope Error

If you encounter an error like `{"errors":[{"message":"Invalid scope: chat","code":"AUTH","http_status":400,"parameters":null}]}`, make sure:

1. You have enabled the specific chat scopes in your FACEIT Developer Portal:
   - chat.messages.read
   - chat.messages.write
   - chat.rooms.read

2. Your application is using these exact scope names in the authorization request. The generic 'chat' scope is not valid - you must use the specific scope names listed above.

3. After making changes to scopes in the Developer Portal, you may need to:
   - Clear your browser cookies/cache
   - Revoke the application's access in your FACEIT account settings
   - Try authenticating again
