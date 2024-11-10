import axios from 'axios';
import urlConstructorUtil from '../../utils/urlConstructor.js';
import getHeaders from '../../utils/headers.js';

/*
    Uses url https://api.faceit.com/chat/v1/rooms/{roomId}/messages
    Method: POST
    Parameters: 
    - roomId: string
    - body: message content
    Description: Send a message to a room
*/
export default async function postRoomByIdMessage(roomId, body) {
  const apiKey = this.getApiKeyServer();
  const headers = getHeaders(apiKey);

  const baseURL = "https://api.faceit.com/chat/v1/rooms";

  // Get url - construct as /rooms/{roomId}/messages
  const url = urlConstructorUtil(
    baseURL,
    ["", "messages"], // Empty string for roomId placeholder
    [roomId],
    [],
    [],
    {}
  );

  // Updated message structure based on swagger docs
  const bodyMessage = {
    content: {
      text: body,
      type: "text",
      metadata: {}
    },
    timestamp: new Date().toISOString()
  };

  console.log('Sending message to:', url);
  console.log('Message body:', bodyMessage);
  console.log('Headers:', headers);

  // Try catch to make the call via axios
  try {
    const response = await axios({
      method: 'post',
      url: url,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      data: bodyMessage
    });

    console.log('Message sent successfully');
    return response.data;
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
    console.error('Full error:', err);
    if (err.response?.data) {
      throw new Error(JSON.stringify(err.response.data));
    }
    throw err;
  }
}
