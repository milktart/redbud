/**
 * Error Handler Middleware
 *
 * Provides consistent error handling across the application
 */

/* eslint-disable max-classes-per-file */

const logger = require('../utils/logger');

/**
 * Custom Application Error class
 * Operational errors that should be handled gracefully
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error types with predefined status codes
 */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

/**
 * Error Handler Middleware
 * Handles all errors in the application
 */
const errorHandler = (err, req, res, next) => {
  // Set defaults
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Common browser-requested assets that result in expected 404s
  const commonMissingAssets = [
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/robots.txt',
    '/sitemap.xml',
  ];

  // Skip logging common, expected 404s
  const isCommon404 = err.statusCode === 404 && commonMissingAssets.includes(req.path);

  // Log error with context (skip common 404s)
  if (!isCommon404) {
    const errorContext = {
      error: err.message,
      statusCode: err.statusCode,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      isOperational: err.isOperational,
    };

    if (err.statusCode >= 500) {
      logger.error('Server error occurred:', errorContext);
    } else {
      logger.warn('Client error occurred:', errorContext);
    }
  }

  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine if we should show detailed errors
  const showDetails = process.env.NODE_ENV !== 'production' || err.isOperational;

  // Handle specific error types
  if (err.name === 'SequelizeValidationError') {
    err.statusCode = 400;
    err.message = err.errors.map((e) => e.message).join(', ');
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    err.statusCode = 409;
    err.message = 'A record with this value already exists';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    err.statusCode = 400;
    err.message = 'Invalid reference to related record';
  }

  // Don't leak error details in production for non-operational errors
  if (!err.isOperational && process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again later.',
    });
  }

  res.status(err.statusCode).json({
    success: false,
    error: showDetails ? err.message : 'An error occurred',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

/**
 * 404 Not Found Handler
 * Catches all requests that don't match any routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError('Page');
  next(error);
};

/**
 * Async handler wrapper with context logging
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    // Log with full context
    logger.error(`${req.method} ${req.path} - ${error.message}`, {
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      stack: error.stack,
    });

    // Pass to error handler middleware
    next(error);
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
