require('dotenv').config();
const axios = require('axios');
const express = require('express');

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Add startup logging
console.log('Bot is starting...');
console.log('Checking environment variables...');

if (!FACEIT_API_KEY) {
    console.error('ERROR: FACEIT_API_KEY is not set in environment variables');
    process.exit(1);
}

if (!FACEIT_HUB_ID) {
    console.error('ERROR: FACEIT_HUB_ID is not set in environment variables');
    process.exit(1);
}

console.log('Environment variables verified ✓');
console.log('Bot is ready to handle messages');

// Send message to match room
async function sendMatchMessage(matchId, message) {
    try {
        console.log(`Sending message to match ${matchId}: ${message}`);
        const payload = {
            channel_id: `match-${matchId}-${FACEIT_HUB_ID}`,
            message: message
        };
        console.log('Request payload:', JSON.stringify(payload, null, 2));
        
        const response = await axios.post('https://api.faceit.com/chat/v1/channels/send', payload, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Message sent successfully:', response.data);
        return true;
    } catch (error) {
        console.error('Error sending message:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Add a test endpoint
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running! ✓');
});

app.get('/test-message/:matchId', async (req, res) => {
    try {
        const { matchId } = req.params;
        await sendMatchMessage(matchId, 'Test message from bot');
        res.send('Test message sent successfully! ✓');
    } catch (error) {
        res.status(500).send(`Error sending test message: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = { sendMatchMessage };
