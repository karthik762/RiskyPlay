const { ZodError } = require('zod');
const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Middleware for handling 404 Not Found for unmatched routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
}

/**
 * Centralized error handling middleware.
 * Recognizes ZodError, AppError, MongoDB Duplicate Key, Mongoose CastError, and generic errors.
 */
function errorHandler(err, req, res, next) {
  // 1. Handle Zod validation errors
  if (err instanceof ZodError || err.name === 'ZodError') {
    const details = err.issues
      ? err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }))
      : [];

    const response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    };

    if (env.NODE_ENV !== 'production' && err.stack) {
      response.error.stack = err.stack;
    }

    return res.status(400).json(response);
  }

  // 2. Handle structured AppError instances
  if (err instanceof AppError || err.isOperational) {
    const response = {
      success: false,
      error: {
        code: err.code || 'APPLICATION_ERROR',
        message: err.message || 'An application error occurred',
      },
    };

    if (err.details !== undefined && err.details !== null) {
      response.error.details = err.details;
    }

    if (env.NODE_ENV !== 'production' && err.stack) {
      response.error.stack = err.stack;
    }

    return res.status(err.statusCode || 400).json(response);
  }

  // 3. Handle MongoDB Duplicate Key (11000) error
  if (err.code === 11000) {
    const isChargeback =
      (err.keyPattern && err.keyPattern.caseNumber) ||
      (typeof err.message === 'string' && err.message.includes('caseNumber'));

    const response = {
      success: false,
      error: {
        code: isChargeback ? 'DUPLICATE_CHARGEBACK' : 'DUPLICATE_TRANSACTION',
        message: isChargeback
          ? 'Chargeback with this caseNumber already exists for this merchant'
          : 'Transaction with this externalTransactionId already exists for this merchant',
      },
    };

    if (env.NODE_ENV !== 'production' && err.stack) {
      response.error.stack = err.stack;
    }

    return res.status(409).json(response);
  }

  // 4. Handle Mongoose CastError (e.g., malformed ObjectId)
  if (err.name === 'CastError') {
    const response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid ${err.path}: ${err.value}`,
      },
    };

    if (env.NODE_ENV !== 'production' && err.stack) {
      response.error.stack = err.stack;
    }

    return res.status(400).json(response);
  }

  // 5. Handle generic/unexpected errors
  const statusCode =
    err.statusCode || (res.statusCode !== 200 && res.statusCode ? res.statusCode : 500);

  const response = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  };

  if (env.NODE_ENV !== 'production' && err.stack) {
    response.error.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
