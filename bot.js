import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD || '70');

let processedMatches = new Set();

async function fetchMatches() {
	try {
		console.log(`Fetching matches for hub ${FACEIT_HUB_ID}`);
		const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${FACEIT_HUB_ID}/matches?type=ongoing&offset=0&limit=20`, {
			headers: {
				'Authorization': `Bearer ${FACEIT_API_KEY}`
			}
		});

		const matches = response.data.items;
		console.log(`Found ${matches.length} matches:`, matches);
		return matches;
    } catch (error) {
		console.error('Error fetching matches:', error.message);
		return [];
	}
}

async function sendMatchMessage(matchId, message) {
    try {
        const response = await axios.post(
            `https://api.faceit.com/match/v1/matches/${matchId}/chat`,
            {
                message: message,
                type: "system"
            },
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error sending match message:', error.message);
        throw error;
    }
}

async function processMatch(match) {

	// Skip if we've already processed this match
	if (processedMatches.has(match.match_id)) {
		return;
	}

	// Check if match is in voting phase (has voting data but no winner)
	const isVotingPhase = match.voting && 
						 match.voting.map && 
						 match.voting.map.entities && 
						 (!match.results || !match.results.winner);

	if (!isVotingPhase) {
		return;
	}

	const faction1 = match.teams.faction1;
	const faction2 = match.teams.faction2;

	const faction1Rating = faction1.stats.rating;
	const faction2Rating = faction2.stats.rating;

	const ratingDiff = Math.abs(faction1Rating - faction2Rating);

	if (ratingDiff > ELO_THRESHOLD) {
		const higherTeam = faction1Rating > faction2Rating ? faction1 : faction2;
		const lowerTeam = faction1Rating > faction2Rating ? faction2 : faction1;

		const message = `⚠️ Warning: High ELO difference detected!\n${higherTeam.name} (${Math.round(higherTeam.stats.rating)}) vs ${lowerTeam.name} (${Math.round(lowerTeam.stats.rating)})\nDifference: ${Math.round(ratingDiff)} points`;

		try {
			await sendMatchMessage(match.match_id, message);
			// Mark this match as processed
			processedMatches.add(match.match_id);
			console.log(`Sent warning message for match ${match.match_id}`);
		} catch (error) {
			console.error(`Failed to send message for match ${match.match_id}:`, error.message);
		}
	}

	// Clean up old matches from processedMatches set (after 1 hour)
	setTimeout(() => {
		processedMatches.delete(match.match_id);
	}, 3600000);
}

async function main() {
	while (true) {
		const matches = await fetchMatches();
		console.log(`Processing ${matches.length} matches`);

		for (const match of matches) {
			await processMatch(match);
		}

		// Wait for 30 seconds before next check
		await new Promise(resolve => setTimeout(resolve, 30000));
	}
}

main().catch(console.error);

async function testClientAuth() {
    console.log('\n=== Testing Client Authentication ===');
    
    try {
        // First get a match ID
        console.log('\nGetting recent match...');
        const matchesResponse = await axios.get(
            `https://open.faceit.com/data/v4/hubs/${process.env.FACEIT_HUB_ID}/matches?offset=0&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
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
                            'Authorization': `Bearer ${FACEIT_API_KEY}`,
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
                const ws = new WebSocket('wss://api.faceit.com/chat/v1/web/rooms', {
                    headers: {
                        'Authorization': `Bearer ${FACEIT_API_KEY}`,
                        'User-Agent': 'FACEIT-Client/1.0',
                        'Origin': 'https://www.faceit.com'
                    }
                });
                ws.on('error', (error) => {
                    console.error('✗ WebSocket auth failed');
                    console.error('Error:', error.message);
                });

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
                            'Authorization': `Bearer ${FACEIT_API_KEY}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'FACEIT-Client/1.0'
                        }
                    }
                );
                console.log('✓ Client token obtained');
                console.log('Response:', tokenResponse.data);
            } catch (error) {
                console.error('✗ Client token failed');
                console.error('Error:', error.response?.data || error.message);
            }
        } catch (error) {
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
}

testClientAuth().catch(console.error);
