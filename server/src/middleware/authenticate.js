const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

/**
 * JWT Bearer authentication middleware.
 * Validates access tokens and populates req.user with minimal identity without querying MongoDB.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(
      new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED')
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    return next(
      new AppError('Invalid authorization header format', 401, 'INVALID_TOKEN')
    );
  }

  const token = parts[1].trim();

  try {
    const decoded = verifyAccessToken(token);

    req.user = {
      merchantId: decoded.sub,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticate;
