const express = require('express');
const app = express();

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.type('text/plain');
    res.send('Bot is running! ✓');
});

// Test endpoint
app.get('/ping', (req, res) => {
    res.type('text/plain');
    res.send('pong');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).type('text/plain').send('Something broke!');
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('Server is running on port', port);
});
