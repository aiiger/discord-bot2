// Generate a 64-byte (512-bit) secret and convert it to a hexadecimal string
const crypto = require('crypto');

const sessionSecret = crypto.randomBytes(64).toString('hex');
console.log(sessionSecret);

ce476c541ae993203973666dd1176a08077f13e60388e0a8aa01aee8fca8dda84118e649bc822f9dc1394329cdfe6d987098bca582b63141cb3636b88fb5a64c