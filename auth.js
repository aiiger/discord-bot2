import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Add middleware
app.use(express.json());
app.use(cors());

// FACEIT API configuration
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;

// Validate required environment variables
if (!FACEIT_API_KEY || !FACEIT_HUB_ID) {
    console.error('Missing required environment variables:');
    if (!FACEIT_API_KEY) console.error('- FACEIT_API_KEY');
    if (!FACEIT_HUB_ID) console.error('- FACEIT_HUB_ID');
    process.exit(1);
}

// Test endpoint to verify API authentication using hub details
app.get('/test-auth', async (_, res) => {
    try {
        console.log('Testing API authentication...');
        const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${FACEIT_HUB_ID}`, {
            headers: {
                'Authorization': `Bearer ${FACEIT_API_KEY}`
            }
        });
        
        console.log('API authentication successful');
        res.json({
            status: 'success',
            message: 'API authentication successful',
            hubName: response.data.name,
            hubGame: response.data.game_id,
            hubRegion: response.data.region
        });
    } catch (error) {
        console.error('API authentication failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });

        res.status(500).json({
            error: 'API authentication failed',
            details: error.response?.data || error.message
        });
    }
});

// Health check endpoint
app.get('/health', (_, res) => {
    res.json({
        status: 'healthy',
        apiKey: FACEIT_API_KEY ? 'configured' : 'missing',
        hubId: FACEIT_HUB_ID ? 'configured' : 'missing'
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('- GET /test-auth - Test API authentication');
    console.log('- GET /health - Check server status');
});
