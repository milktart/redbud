/**
 * Auth Business Service
 *
 * Handles authentication and user registration business logic.
 * Extracted from authController to separate HTTP concerns from business logic.
 *
 * NOTE: Companion-related logic has been intentionally excluded from this service.
 * The companion system will be rearchitected separately. This service focuses on
 * core user registration only.
 *
 * Usage:
 *   const AuthBusinessService = require('../services/business/AuthBusinessService');
 *   const authService = new AuthBusinessService();
 *
 *   const user = await authService.registerUser({
 *     email: 'user@example.com',
 *     password: 'password123',
 *     firstName: 'John',
 *     lastName: 'D'
 *   });
 */

const bcrypt = require('bcrypt');
const { User } = require('../../models');
const logger = require('../../utils/logger');

class AuthBusinessService {
  /**
   * Register a new user account
   *
   * Handles user registration with email uniqueness validation,
   * password hashing, and admin email detection.
   *
   * NOTE: This version excludes companion auto-linking logic.
   * The companion system will be rearchitected separately.
   *
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email (will be lowercased)
   * @param {string} userData.password - Plain text password (will be hashed)
   * @param {string} userData.firstName - User first name
   * @param {string} userData.lastName - User last initial (single character)
   * @param {string} [userData.name] - Alternative: full name (will be split)
   * @returns {Promise<Object>} Created user object (without password)
   * @throws {Error} If email already exists or validation fails
   *
   * @example
   * const user = await authService.registerUser({
   *   email: 'john@example.com',
   *   password: 'securepass123',
   *   firstName: 'John',
   *   lastName: 'D'
   * });
   */
  async registerUser(userData) {
    const { email, phone, password, firstName, lastName, name } = userData;

    if (!password) {
      const error = new Error('Password is required');
      error.statusCode = 400;
      throw error;
    }

    if (!email && !phone) {
      const error = new Error('An email address or phone number is required');
      error.statusCode = 400;
      throw error;
    }

    const { Op } = require('sequelize');
    const normalizedEmail = email ? email.toLowerCase() : null;
    const normalizedPhone = phone ? phone.trim() : null;

    // Check if email or phone already exists (non-phantom)
    const orConditions = [];
    if (normalizedEmail) orConditions.push({ email: normalizedEmail });
    if (normalizedPhone) orConditions.push({ phone: normalizedPhone });

    const existingUser = await User.findOne({ where: { [Op.or]: orConditions } });

    if (existingUser && !existingUser.isPhantom) {
      const error = new Error('An account with this email or phone number already exists');
      error.statusCode = 400;
      throw error;
    }

    // Support both firstName/lastName and name fields
    let first = firstName;
    let last = lastName;

    if (name && !firstName && !lastName) {
      const nameParts = name.split(' ');
      first = nameParts[0];
      last = nameParts[1] || nameParts[0].charAt(0);
    }

    if (!first || !last) {
      const error = new Error('First name and last name are required');
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const isAdminEmail = normalizedEmail && normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase();

    let newUser;
    if (existingUser?.isPhantom) {
      // Claim the phantom record
      await existingUser.update({
        email: normalizedEmail ?? existingUser.email,
        phone: normalizedPhone ?? existingUser.phone,
        password: hashedPassword,
        firstName: first,
        lastName: last,
        isPhantom: false,
        isAdmin: isAdminEmail,
      });
      newUser = existingUser;
    } else {
      newUser = await User.create({
        email: normalizedEmail,
        phone: normalizedPhone,
        password: hashedPassword,
        firstName: first,
        lastName: last,
        isAdmin: isAdminEmail,
      });
    }

    return this.sanitizeUserForResponse(newUser);
  }

  /**
   * Remove sensitive fields from user object
   *
   * @param {Object} user - User instance or plain object
   * @returns {Object} Sanitized user object
   * @private
   */
  sanitizeUserForResponse(user) {
    const plainUser = user.toJSON ? user.toJSON() : { ...user };

    // Remove password from response
    delete plainUser.password;

    return {
      id: plainUser.id,
      email: plainUser.email,
      phone: plainUser.phone,
      firstName: plainUser.firstName,
      lastName: plainUser.lastName,
      isAdmin: plainUser.isAdmin,
      createdAt: plainUser.createdAt,
      lastLogin: plainUser.lastLogin,
    };
  }

  /**
   * Validate registration data
   *
   * Performs validation of registration data before creating user.
   * Used for pre-validation in controllers or before calling registerUser.
   *
   * @param {Object} userData - User registration data
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   *
   * @example
   * const validation = authService.validateRegistrationData(req.body);
   * if (!validation.valid) {
   *   return res.status(400).json({ errors: validation.errors });
   * }
   */
  validateRegistrationData(userData) {
    const errors = [];
    const { email, phone, password, firstName, lastName, name } = userData;

    // Must have email or phone
    if (!email && !phone) {
      errors.push('An email address or phone number is required');
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Invalid email format');
    }

    // Password validation
    if (!password) {
      errors.push('Password is required');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }

    // Name validation
    const hasFirstLast = firstName && lastName;
    const hasName = name;

    if (!hasFirstLast && !hasName) {
      errors.push('First name and last name are required');
    }

    // Last name should be single character
    if (lastName && lastName.length !== 1) {
      errors.push('Last name must be a single character (initial)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if an email is already registered
   *
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email exists
   */
  async isEmailRegistered(email) {
    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });

    return !!existingUser;
  }

  /**
   * Get user by email
   *
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async getUserByEmail(email) {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUserForResponse(user);
  }

  /**
   * Verify user password
   *
   * Used for login and password confirmation flows.
   *
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Promise<Object|null>} User object if valid, null if invalid
   */
  async verifyUserPassword(email, password) {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return null;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return this.sanitizeUserForResponse(user);
  }
}

module.exports = AuthBusinessService;
