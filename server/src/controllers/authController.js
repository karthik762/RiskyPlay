const authService = require('../services/authService');

/**
 * Controller to handle merchant registration.
 * Responds with HTTP 201 on success.
 */
async function signup(req, res, next) {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to handle merchant login.
 * Responds with HTTP 200 on success.
 */
async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve the authenticated merchant profile.
 * Responds with HTTP 200 on success.
 */
async function getMe(req, res, next) {
  try {
    const merchant = await authService.getCurrentMerchant(req.user.merchantId);
    res.status(200).json({
      success: true,
      data: {
        merchant,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  getMe,
};
