/**
 * User Business Service
 *
 * Handles user management business logic (CRUD operations).
 * Extracted from userController to separate HTTP concerns from business logic.
 *
 * This service handles:
 * - User creation (admin)
 * - User updates (admin)
 * - User deactivation (admin)
 * - User search
 * - User retrieval
 *
 * Usage:
 *   const UserBusinessService = require('../services/business/UserBusinessService');
 *   const userService = new UserBusinessService();
 *
 *   const user = await userService.createUser({
 *     email: 'user@example.com',
 *     password: 'password123',
 *     firstName: 'John',
 *     lastName: 'D'
 *   });
 */

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User } = require('../../models');
const logger = require('../../utils/logger');

class UserBusinessService {
  /**
   * Get all active users
   *
   * Returns all active (non-deleted) users ordered by creation date.
   * Excludes password field from results.
   *
   * @param {Object} options - Query options
   * @param {boolean} [options.includeInactive=false] - Include inactive users
   * @param {string} [options.orderBy='createdAt'] - Field to order by
   * @param {string} [options.orderDir='DESC'] - Order direction
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers(options = {}) {
    const {
      includeInactive = false,
      orderBy = 'createdAt',
      orderDir = 'DESC',
    } = options;

    const whereClause = {};
    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'email', 'firstName', 'lastName', 'isAdmin', 'lastLogin', 'createdAt'],
      order: [[orderBy, orderDir]],
    });

    return users.map((user) => user.toJSON());
  }

  /**
   * Create a new user (admin function)
   *
   * @param {Object} userData - User data
   * @param {string} userData.email - User email (will be lowercased)
   * @param {string} userData.firstName - First name
   * @param {string} userData.lastName - Last initial (single character)
   * @param {string} userData.password - Plain text password (will be hashed)
   * @param {boolean} [userData.isAdmin=false] - Admin flag
   * @returns {Promise<Object>} Created user object (without password)
   * @throws {Error} If validation fails or email already exists
   */
  async createUser(userData) {
    const { email, firstName, lastName, password, isAdmin } = userData;

    // Validate required fields
    const validation = this.validateUserData({ email, firstName, lastName, password });
    if (!validation.valid) {
      const error = new Error(validation.errors.join(', '));
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.toLowerCase();

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      const error = new Error('Email already registered');
      error.statusCode = 400;
      throw error;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      email: normalizedEmail,
      firstName,
      lastName,
      password: hashedPassword,
      isAdmin: isAdmin === true,
      isActive: true,
    });

    return this.sanitizeUserForResponse(newUser);
  }

  /**
   * Update a user
   *
   * @param {string} userId - User ID to update
   * @param {Object} updateData - Fields to update
   * @param {string} [updateData.firstName] - First name
   * @param {string} [updateData.lastName] - Last initial
   * @param {string} [updateData.password] - New password (will be hashed)
   * @param {boolean} [updateData.isAdmin] - Admin flag
   * @returns {Promise<Object>} Updated user object (without password)
   * @throws {Error} If user not found or validation fails
   */
  async updateUser(userId, updateData) {
    const { firstName, lastName, password, isAdmin } = updateData;

    // Find user
    const user = await User.findByPk(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate lastName if provided
    if (lastName !== undefined) {
      if (lastName.length !== 1) {
        const error = new Error('Last name must be a single character (initial)');
        error.statusCode = 400;
        throw error;
      }
      user.lastName = lastName;
    }

    // Update fields
    if (firstName !== undefined) {
      user.firstName = firstName;
    }

    if (isAdmin !== undefined) {
      user.isAdmin = isAdmin === true;
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        const error = new Error('Password must be at least 6 characters');
        error.statusCode = 400;
        throw error;
      }
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    return this.sanitizeUserForResponse(user);
  }

  /**
   * Update the current user's own profile (firstName, lastName, phone)
   *
   * @param {string} userId - The authenticated user's ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object>} Updated user object (without password)
   */
  async updateMe(userId, updateData) {
    const { firstName, lastName, phone } = updateData;

    const user = await User.findByPk(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (firstName !== undefined) {
      user.firstName = firstName;
    }

    if (lastName !== undefined) {
      if (lastName.length > 1) {
        const error = new Error('Last name must be a single character (initial)');
        error.statusCode = 400;
        throw error;
      }
      user.lastName = lastName;
    }

    if (phone !== undefined) {
      user.phone = phone || null;
    }

    await user.save();

    return this.sanitizeUserForResponse(user);
  }

  /**
   * Deactivate a user (soft delete)
   *
   * @param {string} userId - User ID to deactivate
   * @param {string} requestingUserId - ID of user making the request
   * @returns {Promise<Object>} Deactivated user object
   * @throws {Error} If user not found or trying to deactivate self
   */
  async deactivateUser(userId, requestingUserId) {
    // Prevent deactivating own account
    if (userId === requestingUserId) {
      const error = new Error('You cannot deactivate your own account. Contact support if needed.');
      error.statusCode = 403;
      throw error;
    }

    const user = await User.findByPk(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Soft delete
    user.isActive = false;
    await user.save();

    return this.sanitizeUserForResponse(user);
  }

  /**
   * Reactivate a user
   *
   * @param {string} userId - User ID to reactivate
   * @returns {Promise<Object>} Reactivated user object
   * @throws {Error} If user not found
   */
  async reactivateUser(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    user.isActive = true;
    await user.save();

    return this.sanitizeUserForResponse(user);
  }

  /**
   * Get user by ID
   *
   * @param {string} userId - User ID
   * @param {boolean} [includeInactive=false] - Include inactive users
   * @returns {Promise<Object>} User object
   * @throws {Error} If user not found
   */
  async getUserById(userId, includeInactive = false) {
    const whereClause = { id: userId };

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const user = await User.findOne({
      where: whereClause,
      attributes: ['id', 'email', 'firstName', 'lastName', 'isAdmin', 'lastLogin', 'createdAt', 'isActive'],
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user.toJSON();
  }

  /**
   * Search users by email (partial match)
   */
  async searchUsersByEmail(searchTerm, options = {}) {
    return this.searchUsersByIdentifier(searchTerm, options);
  }

  /**
   * Search users by email or phone number.
   *
   * Matches against email (partial, case-insensitive) and exact phone.
   * Excludes phantom users from results.
   *
   * @param {string} searchTerm - Email or phone search term
   * @param {Object} options - Search options
   * @param {number} [options.limit=10] - Maximum results to return
   * @param {boolean} [options.includeInactive=false] - Include inactive users
   * @returns {Promise<Array>} Array of matching user objects
   */
  async searchUsersByIdentifier(searchTerm, options = {}) {
    const { limit = 10, includeInactive = false, includePhantom = false } = options;

    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
      const error = new Error('Search parameter is required');
      error.statusCode = 400;
      throw error;
    }

    const normalized = searchTerm.toLowerCase().trim();

    const whereClause = {
      [Op.or]: [
        { email: { [Op.iLike]: `%${normalized}%` } },
        { phone: normalized },
        { firstName: { [Op.iLike]: `%${normalized}%` } },
        { lastName: { [Op.iLike]: `%${normalized}%` } },
      ],
    };

    if (!includePhantom) {
      whereClause.isPhantom = false;
    }

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'email', 'phone', 'firstName', 'lastName'],
      limit,
      order: [['email', 'ASC']],
    });

    return users.map((user) => user.toJSON());
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
      attributes: ['id', 'email', 'firstName', 'lastName', 'isAdmin', 'lastLogin', 'createdAt', 'isActive'],
    });

    return user ? user.toJSON() : null;
  }

  /**
   * Check if user exists by ID
   *
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user exists
   */
  async userExists(userId) {
    const count = await User.count({
      where: { id: userId, isActive: true },
    });

    return count > 0;
  }

  /**
   * Validate user data
   *
   * @param {Object} userData - User data to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   * @private
   */
  validateUserData(userData) {
    const errors = [];
    const { email, firstName, lastName, password } = userData;

    // Email validation
    if (!email) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Invalid email format');
    }

    // First name validation
    if (!firstName || firstName.trim().length === 0) {
      errors.push('First name is required');
    }

    // Last name validation
    if (!lastName) {
      errors.push('Last name is required');
    } else if (lastName.length !== 1) {
      errors.push('Last name must be a single character (initial)');
    }

    // Password validation (if provided)
    if (password !== undefined && password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
      lastLogin: plainUser.lastLogin,
      createdAt: plainUser.createdAt,
      isActive: plainUser.isActive,
    };
  }

  /**
   * Get user statistics
   *
   * Returns counts of active/inactive users, admins, etc.
   *
   * @returns {Promise<Object>} User statistics
   */
  async getUserStatistics() {
    const [totalUsers, activeUsers, inactiveUsers, adminUsers] = await Promise.all([
      User.count(),
      User.count({ where: { isActive: true } }),
      User.count({ where: { isActive: false } }),
      User.count({ where: { isAdmin: true, isActive: true } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminUsers,
    };
  }
}

module.exports = UserBusinessService;
