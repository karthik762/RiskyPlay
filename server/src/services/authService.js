const mongoose = require('mongoose');
const { Merchant } = require('../models');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

/**
 * Strips sensitive fields and formats a safe public merchant object.
 *
 * @param {Object} merchant - Merchant Mongoose document
 * @returns {Object} Safe merchant profile
 */
function formatSafeMerchant(merchant) {
  return {
    id: merchant._id.toString(),
    name: merchant.name,
    email: merchant.email,
    currency: merchant.currency,
    businessProfile: merchant.businessProfile,
    riskThresholds: merchant.riskThresholds,
    createdAt: merchant.createdAt,
  };
}

/**
 * Registers a new merchant with hashed password and returns a signed access token.
 *
 * @param {Object} data - Validated signup data (name, email, password, currency, businessProfile)
 * @returns {Promise<Object>} Safe merchant object and JWT token
 */
async function signup(data) {
  const normalizedEmail = data.email.toLowerCase().trim();

  // 1. Check if email already registered
  const existingMerchant = await Merchant.findOne({ email: normalizedEmail });
  if (existingMerchant) {
    throw new AppError(
      'A merchant with this email already exists',
      409,
      'MERCHANT_ALREADY_EXISTS'
    );
  }

  // 2. Hash plaintext password
  const passwordHash = await hashPassword(data.password);

  // 3. Persist new merchant
  let merchant;
  try {
    merchant = await Merchant.create({
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash,
      currency: data.currency || 'USD',
      businessProfile: data.businessProfile,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(
        'A merchant with this email already exists',
        409,
        'MERCHANT_ALREADY_EXISTS'
      );
    }
    throw error;
  }

  // 4. Generate JWT access token
  const token = signAccessToken(merchant);

  return {
    merchant: formatSafeMerchant(merchant),
    token,
  };
}

/**
 * Authenticates merchant credentials and generates an access token.
 *
 * @param {Object} data - Login credentials (email, password)
 * @returns {Promise<Object>} Safe merchant object and JWT token
 */
async function login(data) {
  const normalizedEmail = data.email.toLowerCase().trim();

  // 1. Find merchant explicitly requesting passwordHash (normally omitted by select: false)
  const merchant = await Merchant.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!merchant) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // 2. Verify password
  const isMatch = await comparePassword(data.password, merchant.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // 3. Generate JWT access token
  const token = signAccessToken(merchant);

  return {
    merchant: formatSafeMerchant(merchant),
    token,
  };
}

/**
 * Retrieves the profile of the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @returns {Promise<Object>} Safe merchant profile
 */
async function getCurrentMerchant(merchantId) {
  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new AppError('Invalid merchant ID', 400, 'VALIDATION_ERROR');
  }

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
  }

  return formatSafeMerchant(merchant);
}

module.exports = {
  signup,
  login,
  getCurrentMerchant,
};
