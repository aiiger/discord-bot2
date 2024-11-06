const logger = require('./logger.js');

app.get('/callback', async (req, res) => {
  try {
    logger.info(`Callback received with query: ${JSON.stringify(req.query)}`);
    // ... rest of your code
  } catch (error) {
    logger.error(`Error during OAuth callback: ${error.message}`);
    res.redirect('/?error=auth_failed');
  }
});
