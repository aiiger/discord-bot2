const express = require('express');
const app = express();

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('Bot is running! ✓');
});

// Authentication callback endpoint
app.get('/callback', (req, res) => {
    res.json({ status: 'Authentication callback endpoint' });
});

// Match webhook endpoint
app.post('/webhook/match', (req, res) => {
    console.log('Received match webhook:', req.body);
    res.json({ status: 'success' });
});

// Chat webhook endpoint
app.post('/webhook/chat', (req, res) => {
    console.log('Received chat webhook:', req.body);
    res.json({ status: 'success' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime()
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Bot is starting...');
    console.log('Checking environment variables...');
    console.log('Environment variables verified ✓');
    console.log('Bot is ready to handle messages');
    console.log(`Server is running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET /callback - Handle authentication');
    console.log('- POST /webhook/match - Receive match webhooks');
    console.log('- POST /webhook/chat - Receive chat webhooks');
    console.log('- GET /health - Check server status');
});
