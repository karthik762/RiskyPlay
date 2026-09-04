const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcryptjs.
 *
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 *
 * @param {string} password - Plaintext password
 * @param {string} passwordHash - Stored bcrypt hash
 * @returns {Promise<boolean>} True if password matches hash, false otherwise
 */
async function comparePassword(password, passwordHash) {
  if (!password || !passwordHash) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  hashPassword,
  comparePassword,
};
