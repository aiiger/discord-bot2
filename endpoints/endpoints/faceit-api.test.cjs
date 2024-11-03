// endpoints/faceitAPI.js

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const BASE_URL = 'https://open.faceit.com/data/v4';

const faceitAPI = {
    async getHubMatches(hubId, status) {
        try {
            const response = await axios.get(`${BASE_URL}/hubs/${hubId}/matches`, {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                },
                params: {
                    status: status
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching hub matches:', error);
            return error;
        }
    },

    async getMatchDetails(matchId) {
        try {
            const response = await axios.get(`${BASE_URL}/matches/${matchId}`, {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching match details:', error);
            return error;
        }
    },

    async getPlayerDetails(playerId) {
        try {
            const response = await axios.get(`${BASE_URL}/players/${playerId}`, {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching player details:', error);
            return error;
        }
    }
};

export default faceitAPI;