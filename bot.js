const express = require('express');
const app = express();

// Add middleware for parsing JSON
app.use(express.json());

// Security constants
const WEBHOOK_SECRET = 'faceit-webhook-secret-123';

// Webhook security middleware
const verifyWebhookSecret = (req, res, next) => {
    const headerSecret = req.headers['x-webhook-secret'];
    const querySecret = req.query.secret;

    if (headerSecret === WEBHOOK_SECRET || querySecret === WEBHOOK_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.type('text/plain');
    res.send('Bot is running! ✓');
});

// Match webhook endpoint with security
app.post('/webhook/match', verifyWebhookSecret, (req, res) => {
    const event = req.body.event || '';
    const payload = req.body.payload || {};
    
    console.log('Received match webhook:', {
        event: event,
        matchId: payload.id,
        timestamp: new Date().toISOString()
    });

    // Handle different match events
    switch (event) {
        case 'match_status_ready':
        case 'match_status_configuring':
            console.log('Match is starting:', payload.id);
            break;
        case 'match_status_finished':
            console.log('Match has finished:', payload.id);
            break;
        default:
            console.log('Received match event:', event);
    }

    res.json({ status: 'success', event: event });
});

// Chat webhook endpoint with security
app.post('/webhook/chat', verifyWebhookSecret, (req, res) => {
    const payload = req.body.payload || {};
    
    console.log('Received chat webhook:', {
        matchId: payload.match_id,
        userId: payload.user_id,
        message: payload.message,
        timestamp: new Date().toISOString()
    });

    // Handle chat commands
    if (payload.message && payload.message.text) {
        const text = payload.message.text;
        if (text.startsWith('!')) {
            console.log('Received command:', text);
        }
    }

    res.json({ status: 'success' });
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
    console.log('Bot is starting...');
    console.log('Server is running on port', port);
    console.log('Available endpoints:');
    console.log('- POST /webhook/match - Receive match webhooks');
    console.log('- POST /webhook/chat - Receive chat webhooks');
    console.log('- GET /health - Check server status');
});
