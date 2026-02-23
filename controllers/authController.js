/**
 * Auth Controller
 *
 * Handles authentication HTTP requests.
 * Delegates business logic to AuthBusinessService.
 *
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation (basic)
 * - Error formatting for API responses
 *
 * Business logic is in: services/business/AuthBusinessService.js
 */

const AuthBusinessService = require('../services/business/AuthBusinessService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const authService = new AuthBusinessService();

/**
 * POST /auth/register
 * Register a new user account
 *
 * NOTE: Companion auto-linking has been removed from this controller.
 * The companion system will be rearchitected separately.
 */
exports.postRegister = async (req, res) => {
  try {
    const { email, phone, password, firstName, lastName, name } = req.body;

    // Validate input using service
    const validation = authService.validateRegistrationData(req.body);
    if (!validation.valid) {
      return apiResponse.badRequest(res, validation.errors.join(', '));
    }

    // Register user
    const user = await authService.registerUser({
      email,
      phone,
      password,
      firstName,
      lastName,
      name,
    });

    return apiResponse.success(res, { user }, 'Registration successful! Please log in.');
  } catch (error) {
    logger.error('REGISTRATION_ERROR', { error: error.message, stack: error.stack });

    // Handle specific error codes
    if (error.statusCode === 400) {
      return apiResponse.badRequest(res, error.message);
    }

    return apiResponse.internalError(res, 'An error occurred during registration', error);
  }
};

/**
 * POST /auth/logout
 * Log out current user
 */
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      logger.error('LOGOUT_ERROR', { error: err.message });
      return next(err);
    }

    return apiResponse.success(res, null, 'You have been logged out');
  });
};
