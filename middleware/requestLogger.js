/**
 * Request Logger Middleware
 *
 * Logs all HTTP requests with timing and user context
 */

const logger = require('../utils/logger');

// Configuration
const SLOW_REQUEST_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 3000;

/**
 * Request logging middleware
 * Logs all HTTP requests with response time and status code
 */
const requestLogger = (req, res, next) => {
  // Skip logging for static assets, health checks, and common browser-requested assets
  const skipPaths = [
    '/health',
    '/favicon.ico',
    '/robots.txt',
  ];

  if (
    skipPaths.some((path) => (path.endsWith('/') ? req.path.startsWith(path) : req.path === path))
  ) {
    return next();
  }

  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end;

  // Override end function to log when response completes
  res.end = function (...args) {
    const duration = Date.now() - startTime;

    // Get status code for logging context
    const { statusCode } = res;

    // Build log context
    const logContext = {
      method: req.method,
      path: req.path,
      statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    // Add query params for GET requests (excluding sensitive data)
    if (req.method === 'GET' && Object.keys(req.query).length > 0) {
      logContext.query = req.query;
    }

    // Log only slow requests as warnings (disable info logging)
    if (duration > SLOW_REQUEST_THRESHOLD) {
      logger.warn('Slow request detected', logContext);
    }

    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
};

module.exports = requestLogger;
