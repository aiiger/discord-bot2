import { FaceitJS } from '../../FaceitJS.js';

/*
    Uses url https://api.faceit.com/chat/v1/rooms/{roomId}/messages
    Method: POST
    Parameters: 
    - roomId: string
    - message: string
    Description: Send a message to a room
*/
export default async function postRoomByIdMessage(roomId, message) {
  try {
    const faceitJS = new FaceitJS();
    const response = await faceitJS.sendRoomMessage(roomId, message);
    console.log('Message sent successfully');
    return response;
  } catch (error) {
    console.error('Error sending message:', error.message);
    if (error.response?.data) {
      console.error('API Error Response:', error.response.data);
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}
