// ... (previous code remains the same until sendMatchMessage function)

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
    } catch (error) {
        console.error('Error sending message:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// ... (rest of the code remains the same)
