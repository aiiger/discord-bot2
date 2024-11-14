const axios = require('axios');

async function postRoomByIdMessage(roomId, message, accessToken) {
  try {
    const response = await axios({
      method: 'post',
      url: `https://api.faceit.com/chat/v1/rooms/${roomId}/messages`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        message: message
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error posting message:', error);
    throw error;
  }
}

module.exports = postRoomByIdMessage;
