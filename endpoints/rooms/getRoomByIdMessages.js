// getRoomByIdMessages.js - Get messages from a FACEIT chat room
import { FaceitJS } from '../../FaceitJS.js';

/**
 * Get messages from a FACEIT chat room
 * @param {string} roomId - The ID of the chat room
 * @param {Object} options - Optional parameters
 * @param {number} options.before - Timestamp to get messages before
 * @param {number} options.limit - Maximum number of messages to return (1-50)
 * @returns {Promise<Object>} The messages data
 */
export default async function getRoomByIdMessages(roomId, options = {}) {
  try {
    const faceitJS = new FaceitJS();

    // Ensure we have an access token before attempting to get messages
    if (!faceitJS.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }

    // Validate and prepare query parameters
    const params = {};
    if (options.before) {
      params.timestamp_from = options.before;
    }
    if (options.limit) {
      // Ensure limit is between 1 and 50
      params.limit = Math.min(Math.max(1, options.limit), 50);
    }

    // Get messages
    const response = await faceitJS.chatApiInstance.get(`/rooms/${roomId}/messages`, {
      params
    });

    if (!response.data || !Array.isArray(response.data.messages)) {
      throw new Error('Invalid response from chat API');
    }

    // Update last message timestamp in FaceitJS instance if messages were received
    if (response.data.messages.length > 0) {
      const latestTimestamp = Math.max(...response.data.messages.map(m => m.timestamp));
      faceitJS.lastMessageTimestamps.set(roomId, latestTimestamp);
    }

    console.log(`[CHAT] Retrieved ${response.data.messages.length} messages successfully`);
    return response.data;
  } catch (error) {
    console.error('[CHAT ERROR] Failed to get messages:', error.message);

    // Add more context to the error
    if (error.response?.data) {
      console.error('[CHAT ERROR] API Response:', error.response.data);
    }

    // Rethrow with better error message
    throw new Error(`Failed to get messages: ${error.message}`);
  }
}
