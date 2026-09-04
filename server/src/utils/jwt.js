const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');

/**
 * Retrieves and validates the JWT_SECRET from environment.
 * Throws a runtime error if missing to prevent insecure operation.
 *
 * @returns {string} JWT_SECRET
 */
function getSecret() {
  if (!env.JWT_SECRET || env.JWT_SECRET.trim() === '') {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return env.JWT_SECRET;
}

/**
 * Signs a JWT access token containing minimal merchant identity.
 *
 * @param {Object} merchant - Merchant document or object containing _id
 * @returns {string} Signed JWT access token
 */
function signAccessToken(merchant) {
  const secret = getSecret();
  const merchantId = merchant._id ? merchant._id.toString() : merchant.id;

  const payload = {
    sub: merchantId,
    type: 'merchant',
  };

  const options = {
    expiresIn: env.JWT_EXPIRES_IN || '1h',
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Verifies a JWT access token.
 *
 * @param {string} token - JWT token string
 * @returns {Object} Decoded payload
 */
function verifyAccessToken(token) {
  const secret = getSecret();

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'merchant') {
      throw new AppError('Invalid token type', 401, 'INVALID_TOKEN');
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
