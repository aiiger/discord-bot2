import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY as string;
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID as string;
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD || '70');
const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT || '6');

let processedMatches = new Set<string>();

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

async function sendMatchMessage(matchId: string, message: string) {
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

async function processMatch(match: any) {
	console.log(`Processing match: ${match.match_id} (Status: ${match.status})`);

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
+require('dotenv').config();
+const axios = require('axios');
+
+const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
+const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
+const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
+const REHOST_VOTE_COUNT = parseInt(process.env.REHOST_VOTE_COUNT) || 6;
+
+let processedMatches = new Set();
+
+async function fetchMatches() {
+    try {
+        console.log(`Fetching matches for hub ${FACEIT_HUB_ID}`);
+        const response = await axios.get(`https://open.faceit.com/data/v4/hubs/${FACEIT_HUB_ID}/matches?type=ongoing&offset=0&limit=20`, {
+            headers: {
+                'Authorization': `Bearer ${FACEIT_API_KEY}`
+            }
+        });
+
+        const matches = response.data.items;
+        console.log(`Found ${matches.length} matches:`, matches);
+        return matches;
+    } catch (error) {
+        console.error('Error fetching matches:', error.message);
+        return [];
+    }
+}
+
+async function sendMatchMessage(matchId, message) {
+    try {
+        const response = await axios.post(
+            `https://api.faceit.com/match/v1/matches/${matchId}/chat`,
+            {
+                message: message,
+                type: "system"
+            },
+            {
+                headers: {
+                    'Authorization': `Bearer ${FACEIT_API_KEY}`,
+                    'Content-Type': 'application/json'
+                }
+            }
+        );
+        return response.data;
+    } catch (error) {
+        console.error('Error sending match message:', error.message);
+        throw error;
+    }
+}
+
+async function processMatch(match) {
+    console.log(`Processing match: ${match.match_id} (Status: ${match.status})`);
+
+    // Skip if we've already processed this match
+    if (processedMatches.has(match.match_id)) {
+        return;
+    }
+
+    // Check if match is in voting phase (has voting data but no winner)
+    const isVotingPhase = match.voting && 
+                         match.voting.map && 
+                         match.voting.map.entities && 
+                         (!match.results || !match.results.winner);
+
+    if (!isVotingPhase) {
+        return;
+    }
+
+    const faction1 = match.teams.faction1;
+    const faction2 = match.teams.faction2;
+
+    const faction1Rating = faction1.stats.rating;
+    const faction2Rating = faction2.stats.rating;
+
+    const ratingDiff = Math.abs(faction1Rating - faction2Rating);
+
+    if (ratingDiff > ELO_THRESHOLD) {
+        const higherTeam = faction1Rating > faction2Rating ? faction1 : faction2;
+        const lowerTeam = faction1Rating > faction2Rating ? faction2 : faction1;
+
+        const message = `⚠️ Warning: High ELO difference detected!\n${higherTeam.name} (${Math.round(higherTeam.stats.rating)}) vs ${lowerTeam.name} (${Math.round(lowerTeam.stats.rating)})\nDifference: ${Math.round(ratingDiff)} points`;
+
+        try {
+            await sendMatchMessage(match.match_id, message);
+            // Mark this match as processed
+            processedMatches.add(match.match_id);
+            console.log(`Sent warning message for match ${match.match_id}`);
+        } catch (error) {
+            console.error(`Failed to send message for match ${match.match_id}:`, error.message);
+        }
+    }
+
+    // Clean up old matches from processedMatches set (after 1 hour)
+    setTimeout(() => {
+        processedMatches.delete(match.match_id);
+    }, 3600000);
+}
+
+async function main() {
+    while (true) {
+        const matches = await fetchMatches();
+        console.log(`Processing ${matches.length} matches`);
+
+        for (const match of matches) {
+            await processMatch(match);
+        }
+
+        // Wait for 30 seconds before next check
+        await new Promise(resolve => setTimeout(resolve, 30000));
+    }
+}
+
+main().catch(console.error);
