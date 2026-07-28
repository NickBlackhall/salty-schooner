const crypto = require('crypto');

// Excludes visually ambiguous characters (I, O, 0, 1) so a code is easy to read off a TV
// and type on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(length = 4) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { generateRoomCode, generateToken };
