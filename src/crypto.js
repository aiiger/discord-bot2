import crypto from 'crypto';

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('base64url');
}

function generateCodeVerifier() {
    return generateRandomString(32);
}

function generateCodeChallenge(codeVerifier) {
    return crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
}

function generateState() {
    return crypto.randomBytes(32).toString('hex');
}

export {
    generateRandomString,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState
};
