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
app.get('/test', (req, res) => {
    res.type('text/plain');
    res.send('Test endpoint works!');
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

// Get port from environment or use 0 to let OS assign a port
const port = process.env.PORT || 0;

// Create HTTP server with error handling
const server = app.listen(port, () => {
    const actualPort = server.address().port;
    console.log('Server is running on port', actualPort);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('Port', port, 'is in use, trying another port...');
        // Try again with a random port
        app.listen(0, () => {
            const actualPort = server.address().port;
            console.log('Server is running on port', actualPort);
        });
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});
