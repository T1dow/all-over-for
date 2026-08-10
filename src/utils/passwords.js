/**
 * src/utils/passwords.js
 * Password hashing with bcrypt (NFR-SEC-01). Passwords are NEVER stored
 * or logged in plaintext. bcryptjs is a pure-JS implementation — no
 * native compilation needed on any machine.
 */
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
