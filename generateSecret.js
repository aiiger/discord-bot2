import crypto from 'crypto';

// Generate a secure random string for SESSION_SECRET
const sessionSecret = crypto.randomBytes(64).toString('hex');
console.log('Generated SESSION_SECRET:');
console.log(sessionSecret);
