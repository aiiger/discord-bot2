import dotenv from 'dotenv';
import axios from 'axios';
import WebSocket from 'ws';

dotenv.config();

async function testClientAuth() {
    console.log('\n=== Testing Client Authentication ===');
    
    try {
        // First get a match ID
        console.log('\nGetting recent match...');
        const matchesResponse = await axios.get(
            `https://open.faceit.com/data/v4/hubs/${process.env.FACEIT_HUB_ID}/matches?offset=0&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`
                }
            }
        );

        if (matchesResponse.data.items && matchesResponse.data.items.length > 0) {
            const testMatch = matchesResponse.data.items[0];
            console.log('Found match:', testMatch.match_id);
            console.log('Status:', testMatch.status);
            console.log('Chat room:', testMatch.chat_room_id);

            // Try to authenticate as a client
            console.log('\nTrying client authentication...');

            // Method 1: Client API with additional headers
            console.log('\nMethod 1: Client API');
            try {
                const response = await axios.post(
                    `https://api.faceit.com/chat/v1/rooms/${testMatch.chat_room_id}/join`,
                    {
                        userId: 'bot',
                        nickname: '🤖 ELO Monitor Bot',
                        role: 'system'
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'FACEIT-Client/1.0',
                            'X-User-Agent': 'FACEIT-Client/1.0',
                            'Origin': 'https://www.faceit.com',
                            'Referer': 'https://www.faceit.com/'
                        }
                    }
                );
                console.log('✓ Client auth successful');
                console.log('Response:', response.data);
            } catch (error) {
                console.error('✗ Client auth failed');
                console.error('Error:', error.response?.data || error.message);
            }

            // Method 2: WebSocket with client headers
            console.log('\nMethod 2: WebSocket with client headers');
            try {
                const ws = new WebSocket('wss://api.faceit.com/chat/v1/web/rooms', {
                    headers: {
                        'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`,
                        'User-Agent': 'FACEIT-Client/1.0',
                        'Origin': 'https://www.faceit.com'
                    }
                });
                
                ws.on('open', () => {
                    console.log('WebSocket connected');
                    // Join room
                    ws.send(JSON.stringify({
                        event: 'join',
                        data: {
                            roomId: testMatch.chat_room_id,
                            userId: 'bot',
                            nickname: '🤖 ELO Monitor Bot'
                        }
                    }));
                });

                ws.on('message', (data) => {
                    console.log('Received:', data.toString());
                });

                ws.on('error', (error) => {
                    console.error('WebSocket error:', error);
                });

                // Keep connection open for a bit
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error('WebSocket connection failed:', error);
            }

            // Method 3: Try to get a client token first
            console.log('\nMethod 3: Client token');
            try {
                const tokenResponse = await axios.post(
                    'https://api.faceit.com/auth/v1/sessions',
                    {
                        app: 'FACEIT-Client',
                        version: '1.0',
                        timestamp: Date.now()
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'FACEIT-Client/1.0'
                        }
                    }
                );
                console.log('✓ Client token obtained');
                console.log('Token:', tokenResponse.data);
            } catch (error) {
                console.error('✗ Client token failed');
                console.error('Error:', error.response?.data || error.message);
            }
        } else {
            console.log('No matches found to test');
        }
    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
            console.error('Status:', error.response.status);
        }
    }
}

// Run the test
testClientAuth().catch(console.error);
