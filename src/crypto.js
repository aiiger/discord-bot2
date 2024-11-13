const crypto = require('crypto');

function base64_url_encode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function generateCodeVerifier() {
    return base64_url_encode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return hash;
}

module.exports = {
    base64_url_encode,
    generateCodeVerifier,
    generateCodeChallenge
};
