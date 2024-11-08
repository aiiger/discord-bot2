// Generate a 64-byte (512-bit) secret and convert it to a hexadecimal string
const crypto = require('crypto');

const sessionSecret = crypto.randomBytes(64).toString('hex');
console.log(sessionSecret);

