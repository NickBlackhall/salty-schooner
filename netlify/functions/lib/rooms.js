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

// Room capacity, not a game rule — deliberately separate from engine.js's
// MATCH_LIMITS, which is rules-protected (AGENTS.md: no rule change without
// Nick's approval). Capping at 6 was Nick's explicit call: "a lot of people
// and a long time in between turns" (2026-08-02).
const MAX_PLAYERS_LIMITS = { min: 2, max: 6, defaultValue: 6 };
function clampMaxPlayers(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return MAX_PLAYERS_LIMITS.defaultValue;
  return Math.min(MAX_PLAYERS_LIMITS.max, Math.max(MAX_PLAYERS_LIMITS.min, parsed));
}

module.exports = { generateRoomCode, generateToken, clampMaxPlayers, MAX_PLAYERS_LIMITS };
