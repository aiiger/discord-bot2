mport dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

class FaceitAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://open.faceit.com/data/v4';
    }

    async matches(matchId, includeStats = false) {
        try {
            const url = `${this.baseUrl}/matches/${matchId}${includeStats ? '/stats' : ''}`;
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getHubMatches(hubId) {
        try {
            const url = `${this.baseUrl}/hubs/${hubId}/matches?type=ongoing&offset=0&limit=20`;
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.data.items || [];
        } catch (error) {
            console.error('Error fetching matches:', error.message);
            return [];
        }
    }
}

const api = new FaceitAPI(process.env.FACEIT_API_KEY);
const FACEIT_HUB_ID = process.env.FACEIT_HUB_ID;
const ELO_THRESHOLD = parseInt(process.env.ELO_THRESHOLD) || 70;
let processedMatches = new Set();

async function processMatch(match) {
    console.log(`\nProcessing match: ${match.match_id} (Status: ${match.status})`);

    // Skip if we've already processed this match
    if (processedMatches.has(match.match_id)) {
        console.log('Match already processed, skipping...');
        return;
    }

    // Only process matches that are ready
    if (!match.teams?.faction1?.roster || !match.teams?.faction2?.roster) {
        console.log('Match not ready for processing (teams not set)');
        return;
    }

    const faction1 = match.teams.faction1;
    const faction2 = match.teams.faction2;

    // Only process matches where both teams have stats
    if (!faction1.stats?.rating || !faction2.stats?.rating) {
        console.log('Match not ready for processing (ratings not available)');
        return;
    }

    const faction1Rating = parseFloat(faction1.stats.rating);
    const faction2Rating = parseFloat(faction2.stats.rating);

    if (isNaN(faction1Rating) || isNaN(faction2Rating)) {
        console.log('Invalid ratings detected, skipping match');
        return;
    }

    const ratingDiff = Math.abs(faction1Rating - faction2Rating);
    const higherTeam = faction1Rating > faction2Rating ? faction1 : faction2;
    const lowerTeam = faction1Rating > faction2Rating ? faction2 : faction1;

    if (ratingDiff > ELO_THRESHOLD) {
        console.log('\n⚠️ High ELO difference detected!');
        console.log(`${higherTeam.name} (${Math.round(higherTeam.stats.rating)}) vs ${lowerTeam.name} (${Math.round(lowerTeam.stats.rating)})`);
        console.log(`Difference: ${Math.round(ratingDiff)} points`);
        console.log(`Match URL: ${match.faceit_url.replace('{lang}', 'en')}`);
        
        // Get detailed match info
        try {
            const matchDetails = await api.matches(match.match_id);
            console.log('Match Details:', matchDetails);

            // Check if rehost conditions are met
            if (matchDetails.status === 'REHOST') {
                console.log('Rehost conditions met, sending message...');
                // Implement message sending logic here
            }

            // Mark match as processed
            processedMatches.add(match.match_id);
            setTimeout(() => {
                processedMatches.delete(match.match_id);
            }, 3600000);
        } catch (error) {
            console.error('Error getting match details:', error.message);
        }
    }
}

async function main() {
    console.log('\n=== FACEIT ELO Monitor Starting ===');
    console.log(`ELO difference threshold: ${ELO_THRESHOLD} points`);
    
    while (true) {
        const matches = await api.getHubMatches(FACEIT_HUB_ID);
        console.log(`\nProcessing ${matches.length} matches`);

        for (const match of matches) {
            await processMatch(match);
        }

        console.log('\nWaiting 30 seconds before next check...');
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

main().catch(console.error);