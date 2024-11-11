// getRoomById.js - Get details of a FACEIT chat room
import { FaceitJS } from '../../FaceitJS.js';

/**
 * Get details of a FACEIT chat room
 * @param {string} roomId - The ID of the chat room
 * @returns {Promise<Object>} The room details
 */
export default async function getRoomById(roomId) {
  try {
    const faceitJS = new FaceitJS();

    // Ensure we have an access token before attempting to get room details
    if (!faceitJS.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }

    // Get room details
    const response = await faceitJS.chatApiInstance.get(`/rooms/${roomId}`);

    if (!response.data) {
      throw new Error('Invalid response from chat API');
    }

    console.log('[CHAT] Room details retrieved successfully');
    return response.data;
  } catch (error) {
    console.error('[CHAT ERROR] Failed to get room details:', error.message);

    // Add more context to the error
    if (error.response?.data) {
      console.error('[CHAT ERROR] API Response:', error.response.data);
    }

    // Rethrow with better error message
    throw new Error(`Failed to get room details: ${error.message}`);
  }
}
