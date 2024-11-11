// postRoomByIdMessage.js - Send a message to a FACEIT chat room
import { FaceitJS } from '../../FaceitJS.js';

/**
 * Send a message to a FACEIT chat room
 * @param {string} roomId - The ID of the chat room
 * @param {string} message - The message to send
 * @returns {Promise<Object>} The API response data
 */
export default async function postRoomByIdMessage(roomId, message) {
  try {
    const faceitJS = new FaceitJS();

    // Ensure we have an access token before attempting to send message
    if (!faceitJS.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }

    // Send message to chat room
    const response = await faceitJS.chatApiInstance.post(`/rooms/${roomId}/messages`, {
      body: message
    });

    if (!response.data) {
      throw new Error('Invalid response from chat API');
    }

    console.log('[CHAT] Message sent successfully');
    return response.data;
  } catch (error) {
    console.error('[CHAT ERROR] Failed to send message:', error.message);

    // Add more context to the error
    if (error.response?.data) {
      console.error('[CHAT ERROR] API Response:', error.response.data);
    }

    // Rethrow with better error message
    throw new Error(`Failed to send message: ${error.message}`);
  }
}
