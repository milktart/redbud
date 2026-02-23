const { body, validationResult } = require('express-validator');

/**
 * Central validation error handler
 * Catches validation errors and returns 400 with error messages
 * All validation chains end with this middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Always return JSON for API requests
    return res.status(400).json({
      success: false,
      message: errors
        .array()
        .map((e) => e.msg)
        .join(', '),
      errors: errors.array(), // Include field-level errors for better frontend feedback
    });
  }
  next();
};

/**
 * VALIDATION CHAINS
 *
 * Simplified validation for unified item API (2026).
 * Type-specific validation is now handled by service layer prepare*Data methods.
 *
 * This file contains only:
 * - User authentication validators (login, registration)
 * - Unified item validators (itemType validation)
 */

module.exports = {
  validateRegistration: [
    body('email')
      .optional({ nullable: true, checkFalsy: true })
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),
    body('phone')
      .optional({ nullable: true, checkFalsy: true })
      .isMobilePhone()
      .withMessage('Invalid phone number'),
    body().custom((value, { req }) => {
      if (!req.body.email && !req.body.phone) {
        throw new Error('An email address or phone number is required');
      }
      return true;
    }),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
    body('firstName').notEmpty().trim().withMessage('First name is required'),
    body('lastName')
      .notEmpty()
      .trim()
      .isLength({ min: 1, max: 1 })
      .withMessage('Last initial must be exactly one character'),
    handleValidationErrors,
  ],

  validateLogin: [
    body('identifier').notEmpty().withMessage('Email or phone number is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors,
  ],

  /**
   * Unified Item Validation
   * Validates the itemType field and delegates to type-specific validation
   */
  validateItemCreation: (req, res, next) => {
    const { itemType } = req.body;
    const validTypes = ['flight', 'hotel', 'transportation', 'event', 'car_rental'];

    if (!itemType) {
      return res.status(400).json({
        success: false,
        message: 'itemType is required',
      });
    }

    if (!validTypes.includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid itemType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Type-specific validation is handled by the controller
    // which calls the appropriate service's prepare*Data method
    next();
  },

  validateItemUpdate: (req, res, next) => {
    const { itemType } = req.body;
    const validTypes = ['flight', 'hotel', 'transportation', 'event', 'car_rental'];

    if (!itemType) {
      return res.status(400).json({
        success: false,
        message: 'itemType is required',
      });
    }

    if (!validTypes.includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid itemType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Type-specific validation is handled by the controller
    next();
  },
};

/**
 * VALIDATION USAGE IN ROUTES
 *
 * Import validation chains in route files:
 *   const { validateRegistration, validateLogin, validateItemCreation, validateItemUpdate } = require('../middleware/validation');
 *
 * Apply to routes:
 *   router.post('/auth/register', validateRegistration, authController.register);
 *   router.post('/auth/login', validateLogin, authController.login);
 *   router.post('/item', validateItemCreation, itemController.createItem);
 *   router.put('/item/:id', validateItemUpdate, itemController.updateItem);
 *
 * All chains automatically handle validation errors and return 400 JSON on failure.
 *
 * FRONTEND INTEGRATION
 *
 * When backend returns validation errors (400 status), the response includes:
 * {
 *   success: false,
 *   message: "comma, separated, error messages",
 *   errors: [
 *     { param: 'fieldName', msg: 'Error message', ... }
 *   ]
 * }
 *
 * Frontend should display these errors alongside form fields.
 */
