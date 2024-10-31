import dotenv from 'dotenv';
import axios from 'axios';
import WebSocket from 'ws';
import fs from 'fs';
import util from 'util';

dotenv.config();

// Configure logging
const logFile = fs.createWriteStream('test.log', { flags: 'a' });
const logToFile = (data) => {
    const timestamp = new Date().toISOString();
    logFile.write(`${timestamp}: ${util.format(data)}\n`);
};

// Override console.log to include file logging
const originalConsoleLog = console.log;
console.log = (...args) => {
    logToFile(args);
    originalConsoleLog.apply(console, args);
};

// Validate environment variables
function validateEnvironment() {
    const required = ['FACEIT_API_KEY', 'FACEIT_HUB_ID'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Error handling
function handleApiError(error, context) {
    console.error(`Error in ${context}:`);
    if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        console.error('Headers:', error.response.headers);
    } else if (error.request) {
        console.error('No response received');
        console.error(error.request);
    } else {
        console.error('Error:', error.message);
    }
}

// Retry logic
async function retryRequest(fn, retries = 3, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        console.log(`Retrying... (${retries} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryRequest(fn, retries - 1, delay * 2);
    }
}

// WebSocket connection handler
function createWebSocketConnection(url, headers, roomId) {
    const ws = new WebSocket(url, { headers });
    
    ws.on('open', () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({
            event: 'join',
            data: {
                roomId: roomId,
                userId: 'bot',
                nickname: '🤖 ELO Monitor Bot'
            }
        }));
    });

    ws.on('message', (data) => {
        console.log('WebSocket message received:', data.toString());
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('WebSocket closed, attempting to reconnect...');
        setTimeout(() => createWebSocketConnection(url, headers, roomId), 5000);
    });

    return ws;
}

// Test client API
async function testClientApi(testMatch) {
    console.log('\nTesting Client API...');
    try {
        const response = await retryRequest(() => 
            axios.post(
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
            )
        );
        console.log('✓ Client API test successful');
        return response.data;
    } catch (error) {
        handleApiError(error, 'testClientApi');
        return null;
    }
}

// Test WebSocket connection
async function testWebSocket(testMatch) {
    console.log('\nTesting WebSocket connection...');
    try {
        const ws = createWebSocketConnection(
            'wss://api.faceit.com/chat/v1/web/rooms',
            {
                'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`,
                'User-Agent': 'FACEIT-Client/1.0',
                'Origin': 'https://www.faceit.com'
            },
            testMatch.chat_room_id
        );

        // Keep connection open for testing
        await new Promise(resolve => setTimeout(resolve, 5000));
        return ws;
    } catch (error) {
        handleApiError(error, 'testWebSocket');
        return null;
    }
}

// Test client token
async function testClientToken() {
    console.log('\nTesting client token...');
    try {
        const response = await retryRequest(() =>
            axios.post(
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
            )
        );
        console.log('✓ Client token obtained');
        return response.data;
    } catch (error) {
        handleApiError(error, 'testClientToken');
        return null;
    }
}

// Main test function
async function testClientAuth() {
    console.log('\n=== Starting FACEIT Client Authentication Test ===');
    
    try {
        validateEnvironment();

        // Get matches
        const matchesResponse = await retryRequest(async () => {
            console.log('\nFetching recent match...');
            return axios.get(
                `https://open.faceit.com/data/v4/hubs/${process.env.FACEIT_HUB_ID}/matches?offset=0&limit=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`
                    }
                }
            );
        });

        if (!matchesResponse.data.items?.length) {
            throw new Error('No matches found to test');
        }

        const testMatch = matchesResponse.data.items[0];
        console.log('Match details:', {
            id: testMatch.match_id,
            status: testMatch.status,
            chatRoom: testMatch.chat_room_id
        });

        // Run all tests
        const results = await Promise.allSettled([
            testClientApi(testMatch),
            testWebSocket(testMatch),
            testClientToken()
        ]);

        console.log('\nTest Results:');
        results.forEach((result, index) => {
            const testName = ['Client API', 'WebSocket', 'Client Token'][index];
            console.log(`${testName}: ${result.status === 'fulfilled' ? '✓ Success' : '✗ Failed'}`);
        });

    } catch (error) {
        handleApiError(error, 'testClientAuth');
    }
}

// Cleanup function
function cleanup() {
    console.log('\nCleaning up...');
    logFile.end();
    process.exit(0);
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run the test
console.log('Starting test server...');
testClientAuth().catch(console.error);

export default testClientAuth;
