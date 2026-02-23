/**
 * Companion Service
 *
 * Manages bidirectional user-to-user companion relationships with permission levels.
 *
 * Key concepts:
 * - When User A adds User B, creates TWO records:
 *   1. userId=A, companionUserId=B, permissionLevel=<specified>
 *   2. userId=B, companionUserId=A, permissionLevel='none' (reciprocal)
 * - Companion permissions are global (apply to all trips/items)
 * - Permission levels: 'none', 'view', 'manage_all'
 */

const BaseService = require('./BaseService');
const { Op } = require('sequelize');
const { Companion, User } = require('../models');
const { PERMISSION_LEVELS } = require('../constants/permissionConstants');
const logger = require('../utils/logger');

class CompanionService extends BaseService {
  constructor() {
    super(Companion);
  }

  /**
   * Add a companion by email or phone with bidirectional relationship.
   * If no account exists for the identifier, a phantom user record is created
   * so that when they register they will automatically inherit all shared data.
   * @param {string} userId - User ID who is adding the companion
   * @param {string} identifier - Email address or phone number of companion
   * @param {string} permissionLevel - Permission level ('view' or 'manage_all')
   * @param {string} [firstName] - First name (required if creating phantom user)
   * @param {string} [lastName] - Last initial (required if creating phantom user)
   * @returns {Promise<Object>} Created companion relationship
   */
  async addCompanion(userId, identifier, permissionLevel = PERMISSION_LEVELS.COMPANION.VIEW, firstName, lastName) {
    const normalized = identifier.toLowerCase().trim();
    const isEmail = normalized.includes('@');

    // Find companion user by email or phone
    let companionUser = await User.findOne({
      where: isEmail ? { email: normalized } : { phone: normalized },
    });

    if (!companionUser) {
      // Create a phantom user so the companion can be linked now and the
      // real account will inherit everything when they register.
      if (!firstName || !lastName) {
        throw new Error('First name and last initial are required to add a companion without an account');
      }
      const crypto = require('crypto');
      companionUser = await User.create({
        email: isEmail ? normalized : null,
        phone: isEmail ? null : normalized,
        password: crypto.randomBytes(32).toString('hex'),
        firstName: firstName.trim(),
        lastName: lastName.trim().charAt(0),
        isPhantom: true,
      });
    }

    if (companionUser.id === userId) {
      throw new Error('Cannot add yourself as a companion');
    }

    // Check if relationship already exists
    const existing = await Companion.findOne({
      where: {
        userId,
        companionUserId: companionUser.id,
      },
    });

    if (existing) {
      throw new Error('Companion relationship already exists');
    }

    // Create bidirectional relationship using transaction
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();

    try {
      // Create primary relationship (A -> B)
      const companionRelationship = await Companion.create(
        {
          userId,
          companionUserId: companionUser.id,
          permissionLevel,
        },
        { transaction }
      );

      // Create reciprocal relationship (B -> A) with 'none' permission
      await Companion.create(
        {
          userId: companionUser.id,
          companionUserId: userId,
          permissionLevel: PERMISSION_LEVELS.COMPANION.NONE,
        },
        { transaction }
      );

      await transaction.commit();

      // Load companion user data for response
      const result = await Companion.findByPk(companionRelationship.id, {
        include: [
          {
            model: User,
            as: 'companionUser',
            attributes: ['id', 'email', 'firstName', 'lastName'],
          },
        ],
      });

      return result;
    } catch (error) {
      await transaction.rollback();
      logger.error('ADD_COMPANION_ERROR', {
        userId,
        companionEmail,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Remove a companion (removes both sides of bidirectional relationship)
   * @param {string} userId - User ID
   * @param {string} companionUserId - Companion user ID to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeCompanion(userId, companionUserId) {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();

    try {
      // Delete both sides of the relationship
      await Companion.destroy({
        where: { userId, companionUserId },
        transaction,
      });

      await Companion.destroy({
        where: { userId: companionUserId, companionUserId: userId },
        transaction,
      });

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      logger.error('REMOVE_COMPANION_ERROR', {
        userId,
        companionUserId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update companion permission level
   * @param {string} userId - User ID
   * @param {string} companionUserId - Companion user ID
   * @param {string} permissionLevel - New permission level
   * @returns {Promise<Object>} Updated companion relationship
   */
  async updatePermission(userId, companionUserId, permissionLevel) {
    const companion = await Companion.findOne({
      where: { userId, companionUserId },
    });

    if (!companion) {
      throw new Error('Companion relationship not found');
    }

    companion.permissionLevel = permissionLevel;
    await companion.save();

    // Load companion user data for response
    const result = await Companion.findByPk(companion.id, {
      include: [
        {
          model: User,
          as: 'companionUser',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
    });

    return result;
  }

  /**
   * Get all companions where userId is the owner
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of companion relationships
   */
  async getMyCompanions(userId) {
    const companions = await Companion.findAll({
      where: { userId },
      include: [
        {
          model: User,
          as: 'companionUser',
          attributes: ['id', 'email', 'firstName', 'lastName', 'phone'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Fetch reverse permission levels (what each companion has granted to me)
    const companionUserIds = companions.map((c) => c.companionUserId);
    const reverseRecords = await Companion.findAll({
      where: { userId: { [Op.in]: companionUserIds }, companionUserId: userId },
      attributes: ['userId', 'permissionLevel'],
    });
    const reverseMap = {};
    for (const r of reverseRecords) {
      reverseMap[r.userId] = r.permissionLevel;
    }

    return companions.map((c) => {
      const plain = c.toJSON();
      plain.reversePermissionLevel = reverseMap[c.companionUserId] ?? PERMISSION_LEVELS.COMPANION.NONE;
      return plain;
    });
  }

  /**
   * Get all companions who have added this user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of companion relationships where user is the companion
   */
  async getCompanionsWhoAddedMe(userId) {
    return await Companion.findAll({
      where: { companionUserId: userId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Check permission level that companionUserId has for userId's resources
   * @param {string} userId - Owner user ID
   * @param {string} companionUserId - Companion user ID
   * @returns {Promise<string|null>} Permission level or null if no relationship
   */
  async checkPermission(userId, companionUserId) {
    const companion = await Companion.findOne({
      where: {
        userId: companionUserId,
        companionUserId: userId,
      },
      attributes: ['permissionLevel'],
    });

    return companion ? companion.permissionLevel : null;
  }

  /**
   * Check if userId has 'view' or 'manage_all' permission for ownerId's items
   * @param {string} userId - User checking permission
   * @param {string} ownerId - Owner of the items
   * @returns {Promise<boolean>} True if has view or manage_all permission
   */
  async canViewAllItems(userId, ownerId) {
    if (userId === ownerId) return true;

    const companion = await Companion.findOne({
      where: {
        userId,
        companionUserId: ownerId,
      },
      attributes: ['permissionLevel'],
    });

    if (!companion) return false;

    return (
      companion.permissionLevel === PERMISSION_LEVELS.COMPANION.VIEW ||
      companion.permissionLevel === PERMISSION_LEVELS.COMPANION.MANAGE_ALL
    );
  }

  /**
   * Check if userId has 'manage_all' permission for ownerId's items
   * @param {string} userId - User checking permission
   * @param {string} ownerId - Owner of the items
   * @returns {Promise<boolean>} True if has manage_all permission
   */
  async canManageAllItems(userId, ownerId) {
    if (userId === ownerId) return true;

    const companion = await Companion.findOne({
      where: {
        userId,
        companionUserId: ownerId,
      },
      attributes: ['permissionLevel'],
    });

    if (!companion) return false;

    return companion.permissionLevel === PERMISSION_LEVELS.COMPANION.MANAGE_ALL;
  }
}

module.exports = CompanionService;
