const crypto = require('crypto');

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateAuthHeader(clientId, clientSecret) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = crypto
        .createHmac('sha256', clientSecret)
        .update(`${clientId}${timestamp}${nonce}`)
        .digest('hex');

    return {
        'faceit-auth': clientId,
        'faceit-nonce': nonce,
        'faceit-timestamp': timestamp,
        'faceit-signature': signature
    };
}

module.exports = {
    generateToken,
    generateAuthHeader
};
