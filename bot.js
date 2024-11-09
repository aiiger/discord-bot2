const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Initialize Redis client
const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true,
        rejectUnauthorized: false
    }
});

// Connect to Redis
(async () => {
    try {
        await redisClient.connect();
        console.log('Redis connected');
    } catch (error) {
        console.error('Redis connection error:', error);
        process.exit(1);
    }
})();

// Session middleware setup with 'secret' option
const sessionMiddleware = session({
    store: new RedisStore({
        client: redisClient,
        prefix: 'faceit:sess:',
        ttl: 86400 // 1 day
    }),
    secret: process.env.SESSION_SECRET, // Ensure SESSION_SECRET is set
    name: 'sessionId',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Match state tracking
const CONFIG_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes
const votes = {};
const greetedMatches = new Set();

const sendMessage = (playerId, message) => {
  faceitJS.sendChatMessage(playerId, message);
};

const sendMessageToAll = async (matchId, message) => {
  try {
    const players = await faceitJS.getPlayersInMatch(matchId);
    players.forEach(player => {
      sendMessage(player.id, message);
    });
  } catch (error) {
    console.error(`Error sending message to all players in match ${matchId}:`, error);
  }
};

const handleVote = async (playerId, voteType, matchId) => {
  if (!votes[matchId]) {
    votes[matchId] = {
      rehost: { agree: 0, total: 0 },
      cancel: { agree: 0, total: 0 }
    };
  }

  const match = await faceitJS.getMatchDetails(matchId);
  if (match.state !== 'CONFIGURING') {
    throw new Error('Voting only allowed during config phase');
  }

  votes[matchId][voteType].total += 1;
  votes[matchId][voteType].agree += 1;

  if (votes[matchId][voteType].agree >= 6) {
    if (voteType === 'rehost') {
      await rehostMatch(matchId);
    } else if (voteType === 'cancel') {
      await cancelMatch(matchId);
    }
  }
};

const rehostMatch = async (matchId) => {
  try {
    await faceitJS.rehostMatch(matchId);
    await sendMessageToAll(matchId, 'Match is being rehosted.');
    delete votes[matchId];
  } catch (error) {
    console.error('Rehost error:', error);
  }
};

const cancelMatch = async (matchId) => {
  try {
    await faceitJS.cancelMatch(matchId);
    await sendMessageToAll(matchId, 'Match has been cancelled.');
    delete votes[matchId];
  } catch (error) {
    console.error('Cancel error:', error);
  }
};

// Match state monitoring
faceitJS.onMatchStateChange(async (match) => {
  if (match.state === 'CONFIGURING' && !greetedMatches.has(match.id)) {
    await sendMessageToAll(match.id, 'Config phase started. Use !rehost or !cancel to vote. You have 5 minutes.');
    greetedMatches.add(match.id);
    
    // Clear votes and greeted status after config phase
    setTimeout(() => {
      if (votes[match.id]) {
        delete votes[match.id];
      }
      greetedMatches.delete(match.id);
    }, CONFIG_TIME_LIMIT);
  }
});

// Routes
app.post('/vote', async (req, res) => {
  try {
    const { playerId, voteType, matchId } = req.body;
    await handleVote(playerId, voteType, matchId);
    res.status(200).send('Vote registered');
  } catch (error) {
    res.status(400).send(error.message);
  }
});

const startServer = async () => {
  await initializeRedis();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;