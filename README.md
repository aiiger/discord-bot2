# FACEIT Bot

A Discord bot for managing FACEIT CS2 matches, with features for rehosting and cancelling matches based on ELO differences.

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Required environment variables:
```env
# FACEIT API Credentials
FACEIT_API_KEY=your_api_key_here
FACEIT_HUB_ID=your_hub_id_here

# Bot Configuration
ELO_THRESHOLD=70        # Minimum ELO difference for match cancellation
REHOST_VOTE_COUNT=6     # Number of votes needed for rehost
NODE_ENV=production     # Set to 'production' in Heroku
```

## Heroku Deployment

1. Create a new Heroku app
2. Set the environment variables in Heroku:
   - Go to Settings -> Config Vars
   - Add all the required environment variables listed above

3. Deploy to Heroku:
```bash
git add .
git commit -m "Initial commit"
git push heroku master
```

## Features

### Match Commands

- `!rehost` - Vote for match rehost
  - Requires configured number of votes (default: 6)
  - Only works during active matches
  - Automatically resets votes when match ends

- `!cancel` - Check if match can be cancelled
  - Checks ELO difference between teams
  - Cancels match if difference exceeds threshold
  - Shows current ELO difference

### API Integration

The bot uses the FACEIT API to:
- Monitor match status
- Calculate team ELO differences
- Execute match rehosts
- Process match cancellations

## Project Structure

```
├── bot.js              # Main bot file
├── auth.js             # Authentication handling
├── endpoints/          # FACEIT API endpoints
│   ├── hubs/          # Hub-related endpoints
│   ├── matches/       # Match-related endpoints
│   └── players/       # Player-related endpoints
├── utils/             # Utility functions
│   ├── headers.js     # API headers
│   └── urlConstructor.js # URL construction
└── public/            # Public web files
```

## Development

To run locally:
```bash
npm start
```

For testing:
```bash
node test/faceit-api.test.js
```

## Error Handling

The bot includes comprehensive error handling for:
- API failures
- Invalid commands
- Missing permissions
- Network issues

All errors are logged and appropriate feedback is provided to users.

## Monitoring

Health check endpoint available at `/health` showing:
- Server status
- Active matches
- Configuration
- Uptime
