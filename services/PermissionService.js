/**
 * Permission Service
 *
 * Centralized service for permission checking and authorization logic.
 * Extracts permission logic previously scattered across controllers and services.
 *
 * Current implementation focuses on ownership-based permissions.
 * Future: Can be extended to handle companion permissions, role-based access, etc.
 *
 * Usage:
 *   const PermissionService = require('../services/PermissionService');
 *   const permissionService = new PermissionService();
 *
 *   if (permissionService.canEditItem(hotel, req.user.id)) {
 *     // Allow edit
 *   }
 */

const logger = require('../utils/logger');
const { Attendee, Companion } = require('../models');
const { Op } = require('sequelize');
const { PERMISSION_LEVELS } = require('../constants/permissionConstants');

class PermissionService {
  /**
   * Check if a user can view an item
   *
   * @param {Object} item - Travel item (Flight, Hotel, Event, etc.)
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has view permission
   */
  canViewItem(item, userId) {
    if (!item || !userId) {
      return false;
    }

    // Owner has view permission
    if (item.userId === userId) {
      return true;
    }

    // Future: Check companion permissions
    // For now, only owners can view
    return false;
  }

  /**
   * Check if a user can edit an item
   *
   * @param {Object} item - Travel item (Flight, Hotel, Event, etc.)
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has edit permission
   */
  canEditItem(item, userId) {
    if (!item || !userId) {
      return false;
    }

    // Owner has edit permission
    if (item.userId === userId) {
      return true;
    }

    // Future: Check companion edit permissions
    // For now, only owners can edit
    return false;
  }

  /**
   * Check if a user can delete an item
   *
   * @param {Object} item - Travel item (Flight, Hotel, Event, etc.)
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has delete permission
   */
  canDeleteItem(item, userId) {
    if (!item || !userId) {
      return false;
    }

    // Owner has delete permission
    if (item.userId === userId) {
      return true;
    }

    // Future: Check companion delete permissions
    // For now, only owners can delete
    return false;
  }

  /**
   * Check if a user can view a trip
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has view permission
   */
  canViewTrip(trip, userId) {
    if (!trip || !userId) {
      return false;
    }

    // Owner has view permission
    if (trip.userId === userId) {
      return true;
    }

    // Future: Check trip companion permissions
    return false;
  }

  /**
   * Check if a user can edit a trip
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has edit permission
   */
  canEditTrip(trip, userId) {
    if (!trip || !userId) {
      return false;
    }

    // Owner has edit permission
    if (trip.userId === userId) {
      return true;
    }

    // Future: Check trip companion edit permissions
    return false;
  }

  /**
   * Check if a user can delete a trip
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user has delete permission
   */
  canDeleteTrip(trip, userId) {
    if (!trip || !userId) {
      return false;
    }

    // Owner has delete permission
    if (trip.userId === userId) {
      return true;
    }

    // Future: Trip companions cannot delete trips (only owner)
    return false;
  }

  /**
   * Get permission flags for an item
   *
   * Returns an object with all permission flags for a given user and item.
   * Useful for enriching API responses with permission metadata.
   *
   * @param {Object} item - Travel item (Flight, Hotel, Event, etc.)
   * @param {string} userId - User ID to check
   * @returns {Object} Permission flags object
   * @returns {boolean} returns.canView - User can view the item
   * @returns {boolean} returns.canEdit - User can edit the item
   * @returns {boolean} returns.canDelete - User can delete the item
   * @returns {boolean} returns.isOwner - User owns the item
   * @returns {boolean} returns.isShared - Item is shared with user (not owner)
   */
  getItemPermissions(item, userId) {
    const isOwner = item && item.userId === userId;

    return {
      canView: this.canViewItem(item, userId),
      canEdit: this.canEditItem(item, userId),
      canDelete: this.canDeleteItem(item, userId),
      isOwner,
      isShared: !isOwner && this.canViewItem(item, userId),
    };
  }

  /**
   * Get permission flags for a trip
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - User ID to check
   * @returns {Object} Permission flags object
   * @returns {boolean} returns.canView - User can view the trip
   * @returns {boolean} returns.canEdit - User can edit the trip
   * @returns {boolean} returns.canDelete - User can delete the trip
   * @returns {boolean} returns.isOwner - User owns the trip
   * @returns {boolean} returns.isShared - Trip is shared with user (not owner)
   */
  getTripPermissions(trip, userId) {
    const isOwner = trip && trip.userId === userId;

    return {
      canView: this.canViewTrip(trip, userId),
      canEdit: this.canEditTrip(trip, userId),
      canDelete: this.canDeleteTrip(trip, userId),
      isOwner,
      isShared: !isOwner && this.canViewTrip(trip, userId),
    };
  }

  /**
   * Check if userId can view an item — attendee, companion, or owner
   * @param {Object} item - Item with .createdBy/.userId, .id, .itemType, and optional .tripId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async canViewItemAsync(item, userId) {
    if (!item || !userId) return false;
    if (item.createdBy === userId || item.userId === userId) return true;

    // Check item-level attendee record
    const attendee = await Attendee.findOne({
      where: { userId, itemType: item.itemType, itemId: item.id },
      attributes: ['id'],
    });
    if (attendee) return true;

    // Check trip-level attendee record (grants access to all items in the trip)
    if (item.tripId) {
      const tripAttendee = await Attendee.findOne({
        where: { userId, itemType: 'trip', itemId: item.tripId },
        attributes: ['id'],
      });
      if (tripAttendee) return true;
    }

    // Check companion permission (view or manage_all)
    const ownerId = item.createdBy || item.userId;
    if (!ownerId) return false;
    const companion = await Companion.findOne({
      where: {
        userId,
        companionUserId: ownerId,
        permissionLevel: { [Op.in]: [PERMISSION_LEVELS.COMPANION.VIEW, PERMISSION_LEVELS.COMPANION.MANAGE_ALL] },
      },
      attributes: ['id'],
    });
    return !!companion;
  }

  /**
   * Check if userId can manage (edit) an item — attendee with manage, companion manage_all, or owner
   * @param {Object} item - Item with .createdBy/.userId, .id, .itemType, and optional .tripId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async canManageItemAsync(item, userId) {
    if (!item || !userId) return false;
    if (item.createdBy === userId || item.userId === userId) return true;

    // Check item-level attendee with manage permission
    const attendee = await Attendee.findOne({
      where: { userId, itemType: item.itemType, itemId: item.id, permissionLevel: PERMISSION_LEVELS.ATTENDEE.MANAGE },
      attributes: ['id'],
    });
    if (attendee) return true;

    // Check trip-level attendee with manage permission
    if (item.tripId) {
      const tripAttendee = await Attendee.findOne({
        where: { userId, itemType: 'trip', itemId: item.tripId, permissionLevel: PERMISSION_LEVELS.ATTENDEE.MANAGE },
        attributes: ['id'],
      });
      if (tripAttendee) return true;
    }

    // Check companion manage_all permission
    const ownerId = item.createdBy || item.userId;
    if (!ownerId) return false;
    const companion = await Companion.findOne({
      where: {
        userId,
        companionUserId: ownerId,
        permissionLevel: PERMISSION_LEVELS.COMPANION.MANAGE_ALL,
      },
      attributes: ['id'],
    });
    return !!companion;
  }

  /**
   * Check if userId can manage a trip — attendee with manage, or owner
   * @param {Object} trip - Trip with .userId, .createdBy, .id
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async canManageTripAsync(trip, userId) {
    if (!trip || !userId) return false;
    if (trip.userId === userId || trip.createdBy === userId) return true;

    const attendee = await Attendee.findOne({
      where: { userId, itemType: 'trip', itemId: trip.id, permissionLevel: PERMISSION_LEVELS.ATTENDEE.MANAGE },
      attributes: ['id'],
    });
    return !!attendee;
  }

  /**
   * Check if userId can view a trip — attendee, companion view/manage_all, or owner
   * @param {Object} trip - Trip with .userId, .id
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async canViewTripAsync(trip, userId) {
    if (!trip || !userId) return false;
    if (trip.userId === userId) return true;

    const attendee = await Attendee.findOne({
      where: { userId, itemType: 'trip', itemId: trip.id },
      attributes: ['id'],
    });
    if (attendee) return true;

    const companion = await Companion.findOne({
      where: {
        userId,
        companionUserId: trip.userId,
        permissionLevel: { [Op.in]: [PERMISSION_LEVELS.COMPANION.VIEW, PERMISSION_LEVELS.COMPANION.MANAGE_ALL] },
      },
      attributes: ['id'],
    });
    return !!companion;
  }

  /**
   * Verify user has access to an item with specific permission level
   *
   * Throws error if user doesn't have required permission.
   * Useful for service-layer authorization checks.
   *
   * @param {Object} item - Travel item
   * @param {string} userId - User ID to check
   * @param {string} permission - Required permission ('view', 'edit', 'delete')
   * @throws {Error} If user doesn't have required permission
   */
  async verifyItemAccess(item, userId, permission = 'view') {
    if (!item) {
      const error = new Error('Item not found');
      error.statusCode = 404;
      throw error;
    }

    let hasPermission = false;

    switch (permission) {
      case 'view':
        hasPermission = this.canViewItem(item, userId);
        break;
      case 'edit':
        hasPermission = this.canEditItem(item, userId);
        break;
      case 'delete':
        hasPermission = this.canDeleteItem(item, userId);
        break;
      default:
        throw new Error(`Invalid permission level: ${permission}`);
    }

    if (!hasPermission) {
      const error = new Error(`Access denied: User does not have ${permission} permission for this item`);
      error.statusCode = 403;
      throw error;
    }
  }

  /**
   * Verify user has access to a trip with specific permission level
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - User ID to check
   * @param {string} permission - Required permission ('view', 'edit', 'delete')
   * @throws {Error} If user doesn't have required permission
   */
  async verifyTripAccess(trip, userId, permission = 'view') {
    if (!trip) {
      const error = new Error('Trip not found');
      error.statusCode = 404;
      throw error;
    }

    let hasPermission = false;

    switch (permission) {
      case 'view':
        hasPermission = this.canViewTrip(trip, userId);
        break;
      case 'edit':
        hasPermission = this.canEditTrip(trip, userId);
        break;
      case 'delete':
        hasPermission = this.canDeleteTrip(trip, userId);
        break;
      default:
        throw new Error(`Invalid permission level: ${permission}`);
    }

    if (!hasPermission) {
      const error = new Error(`Access denied: User does not have ${permission} permission for this trip`);
      error.statusCode = 403;
      throw error;
    }
  }
}

module.exports = PermissionService;
