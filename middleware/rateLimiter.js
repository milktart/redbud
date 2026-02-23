/**
 * Rate Limiting Middleware
 * Phase 3 - Backend Architecture: Middleware Enhancements
 *
 * Protects against brute force attacks and API abuse
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { MS_PER_MINUTE } = require('../utils/constants');

/**
 * General API rate limiter
 * Applied to all API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * MS_PER_MINUTE, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id,
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
    });
  },
});

/**
 * Strict limiter for authentication endpoints
 * Protects against brute force login attempts
 */
const authLimiter = rateLimit({
  windowMs: 15 * MS_PER_MINUTE, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    success: false,
    error: 'Too many login attempts, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
    });

    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again after 15 minutes.',
    });
  },
});

/**
 * Moderate limiter for form submissions
 * Prevents spam and abuse
 */
const formLimiter = rateLimit({
  windowMs: 5 * MS_PER_MINUTE, // 5 minutes
  max: 20, // 20 form submissions per 5 minutes
  message: {
    success: false,
    error: 'Too many form submissions, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Form submission rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id,
    });

    // Always return JSON for API requests
    return res.status(429).json({
      success: false,
      error: 'Too many submissions. Please wait a few minutes.',
    });
  },
});

/**
 * Lenient limiter for search endpoints
 * Allows more frequent requests for search functionality
 */
const searchLimiter = rateLimit({
  windowMs: MS_PER_MINUTE, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    success: false,
    error: 'Too many search requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
});

/**
 * Custom rate limiter for specific use cases
 * @param {Object} options - Rate limit options
 * @returns {Function} Rate limit middleware
 */
function createCustomLimiter(options = {}) {
  const defaults = {
    windowMs: 15 * MS_PER_MINUTE,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  };

  return rateLimit({ ...defaults, ...options });
}

module.exports = {
  apiLimiter,
  authLimiter,
  formLimiter,
  searchLimiter,
  createCustomLimiter,
};
