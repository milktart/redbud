/**
 * API Response Utility
 * Standardized response formatting for API endpoints
 * Phase 3 - API Versioning
 */

const logger = require('./logger');

/**
 * Send standardized success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function success(res, data = null, message = 'Success', statusCode = 200) {
  const response = {
    success: true,
    message,
    data,
  };

  return res.status(statusCode).json(response);
}

/**
 * Send standardized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} errors - Additional error details
 */
function error(res, message = 'An error occurred', statusCode = 500, errors = null) {
  const response = {
    success: false,
    message,
    ...(errors && { errors }),
  };

  logger.error('API Error:', { message, statusCode, errors });

  return res.status(statusCode).json(response);
}

/**
 * Send paginated success response
 * @param {Object} res - Express response object
 * @param {Array} data - Response data array
 * @param {Object} pagination - Pagination metadata
 * @param {string} message - Success message
 */
function paginated(res, data, pagination, message = 'Success') {
  const response = {
    success: true,
    message,
    data,
    pagination: {
      page: pagination.currentPage,
      limit: pagination.limit || 20,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalCount,
      hasNextPage: pagination.hasNextPage,
      hasPrevPage: pagination.hasPrevPage,
    },
  };

  return res.status(200).json(response);
}

/**
 * Send created resource response
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Success message
 */
function created(res, data, message = 'Resource created successfully') {
  return success(res, data, message, 201);
}

/**
 * Send no content response
 * @param {Object} res - Express response object
 */
function noContent(res) {
  return res.status(204).send();
}

/**
 * Send bad request response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {*} errors - Validation errors
 */
function badRequest(res, message = 'Bad request', errors = null) {
  return error(res, message, 400, errors);
}

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

/**
 * Send forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function notFound(res, message = 'Resource not found') {
  return error(res, message, 404);
}

/**
 * Send conflict response (e.g., duplicate resource)
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
function conflict(res, message = 'Resource conflict') {
  return error(res, message, 409);
}

/**
 * Send internal server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Error} err - Error object
 */
function internalError(res, message = 'Internal server error', err = null) {
  if (err) {
    logger.error('Internal Server Error:', {
      message: err.message,
      stack: err.stack,
    });
  }

  return error(res, message, 500);
}

module.exports = {
  success,
  error,
  paginated,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
};
