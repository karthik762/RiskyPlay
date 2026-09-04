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
 * Recognizes ZodError, AppError, and generic JavaScript errors.
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

  // 3. Handle generic/unexpected errors
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
