/**
 * Attendee Controller
 *
 * Handles attendee management for trips and travel items.
 * Attendees are users associated with specific trips/items with local permissions.
 */

const { Op } = require('sequelize');
const AttendeeService = require('../services/AttendeeService');
const { User } = require('../models');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { PERMISSION_LEVELS, ITEM_TYPES } = require('../constants/permissionConstants');

const attendeeService = new AttendeeService();

/**
 * POST /api/v1/attendees
 * Add an attendee to a trip/item by email
 * Body: { email, itemType, itemId, permissionLevel }
 */
exports.addAttendee = async (req, res) => {
  try {
    const {
      email,
      itemType,
      itemId,
      permissionLevel = itemType === ITEM_TYPES.TRIP
        ? PERMISSION_LEVELS.ATTENDEE.MANAGE
        : PERMISSION_LEVELS.ATTENDEE.VIEW,
    } = req.body;
    const userId = req.user.id;

    if (!email || !itemType || !itemId) {
      return apiResponse.badRequest(res, 'Email, itemType, and itemId are required');
    }

    // Find user by email
    const attendeeUser = await User.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!attendeeUser) {
      return apiResponse.notFound(res, 'User with this email not found');
    }

    const attendee = await attendeeService.addAttendee(
      itemType,
      itemId,
      attendeeUser.id,
      permissionLevel,
      userId
    );

    // If adding to a trip, cascade to all items with manage permission
    if (itemType === ITEM_TYPES.TRIP) {
      await attendeeService.cascadeAddToTripItems(itemId, attendeeUser.id, PERMISSION_LEVELS.ATTENDEE.MANAGE, userId);
    }

    return apiResponse.created(res, attendee, 'Attendee added successfully');
  } catch (error) {
    logger.error('ADD_ATTENDEE_ERROR', {
      userId: req.user.id,
      body: req.body,
      error: error.message,
    });

    if (error.message.includes('already an attendee')) {
      return apiResponse.conflict(res, error.message);
    }

    return apiResponse.internalError(res, 'Failed to add attendee', error);
  }
};

/**
 * GET /api/v1/attendees
 * Get all attendees for a trip/item
 * Query: ?itemType=trip&itemId=xxx
 */
exports.getAttendees = async (req, res) => {
  try {
    const { itemType, itemId } = req.query;

    if (!itemType || !itemId) {
      return apiResponse.badRequest(res, 'itemType and itemId query parameters are required');
    }

    const attendees = await attendeeService.getAttendees(itemType, itemId);

    return apiResponse.success(res, attendees, `Retrieved ${attendees.length} attendees`);
  } catch (error) {
    logger.error('GET_ATTENDEES_ERROR', {
      query: req.query,
      error: error.message,
    });
    return apiResponse.internalError(res, 'Failed to retrieve attendees', error);
  }
};

/**
 * PUT /api/v1/attendees/:attendeeId
 * Update attendee permission level
 */
exports.updateAttendeePermission = async (req, res) => {
  try {
    const { attendeeId } = req.params;
    const { permissionLevel } = req.body;

    if (!permissionLevel) {
      return apiResponse.badRequest(res, 'Permission level is required');
    }

    // Get attendee to find itemType, itemId, userId
    const { Attendee } = require('../models');
    const attendee = await Attendee.findByPk(attendeeId);

    if (!attendee) {
      return apiResponse.notFound(res, 'Attendee not found');
    }

    const updated = await attendeeService.updateAttendeePermission(
      attendee.itemType,
      attendee.itemId,
      attendee.userId,
      permissionLevel
    );

    return apiResponse.success(res, updated, 'Attendee permission updated successfully');
  } catch (error) {
    logger.error('UPDATE_ATTENDEE_PERMISSION_ERROR', {
      attendeeId: req.params.attendeeId,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      return apiResponse.notFound(res, error.message);
    }

    return apiResponse.internalError(res, 'Failed to update attendee permission', error);
  }
};

/**
 * DELETE /api/v1/attendees/:attendeeId
 * Remove an attendee
 */
exports.removeAttendee = async (req, res) => {
  try {
    const { attendeeId } = req.params;
    const currentUserId = req.user.id;

    // Get attendee to find itemType, itemId, userId
    const { Attendee } = require('../models');
    const attendee = await Attendee.findByPk(attendeeId);

    if (!attendee) {
      return apiResponse.notFound(res, 'Attendee not found');
    }

    // Get item to check creator
    const itemType = attendee.itemType;
    const itemId = attendee.itemId;
    let item;

    // Load the item to get createdBy
    const { Trip, Flight, Hotel, Event, Transportation, CarRental } = require('../models');
    const models = {
      trip: Trip,
      flight: Flight,
      hotel: Hotel,
      event: Event,
      transportation: Transportation,
      car_rental: CarRental,
    };

    const Model = models[itemType];
    if (Model) {
      item = await Model.findByPk(itemId);
    }

    if (!item) {
      return apiResponse.notFound(res, 'Item not found');
    }

    const isTripItem = itemType !== 'trip' && item.tripId != null;
    const isSelfRemoval = attendee.userId === currentUserId;

    if (itemType === ITEM_TYPES.TRIP && isSelfRemoval) {
      // Allow self-removal from a trip if:
      //   1. At least one other attendee will remain on the trip
      //   2. The user is not the sole attendee on any item within the trip
      const remainingTripAttendees = await Attendee.count({
        where: { itemType: ITEM_TYPES.TRIP, itemId, userId: { [Op.ne]: attendee.userId } },
      });
      if (remainingTripAttendees === 0) {
        return apiResponse.forbidden(res, 'Cannot remove yourself — at least one other traveler must remain on the trip');
      }

      // Check each item type: if user is the only attendee on any item, block removal
      const itemModels = [
        { model: Flight, type: ITEM_TYPES.FLIGHT },
        { model: Hotel, type: ITEM_TYPES.HOTEL },
        { model: Event, type: ITEM_TYPES.EVENT },
        { model: Transportation, type: ITEM_TYPES.TRANSPORTATION },
        { model: CarRental, type: ITEM_TYPES.CAR_RENTAL },
      ];
      for (const { model, type } of itemModels) {
        const tripItems = await model.findAll({ where: { tripId: itemId }, attributes: ['id'], raw: true });
        for (const tripItem of tripItems) {
          const totalAttendees = await Attendee.count({ where: { itemType: type, itemId: tripItem.id } });
          const myAttendance = await Attendee.count({ where: { itemType: type, itemId: tripItem.id, userId: attendee.userId } });
          if (myAttendance > 0 && totalAttendees === 1) {
            return apiResponse.forbidden(res, 'Cannot remove yourself — you are the only traveler on one or more items in this trip');
          }
        }
      }
    } else {
      // Creator cannot be removed from a standalone item or from the trip itself (unless self-removal handled above)
      if (!isTripItem && item.createdBy === attendee.userId) {
        return apiResponse.forbidden(res, 'Cannot remove the creator as an attendee');
      }
    }

    // Can remove if: you are the creator/owner of the parent context, or you are removing yourself
    const canRemove = currentUserId === item.createdBy || currentUserId === attendee.userId;

    if (!canRemove) {
      return apiResponse.forbidden(res, 'You do not have permission to remove this attendee');
    }

    await attendeeService.removeAttendee(itemType, itemId, attendee.userId);

    // If removing from a trip, cascade to all items
    if (itemType === ITEM_TYPES.TRIP) {
      await attendeeService.cascadeRemoveFromTripItems(itemId, attendee.userId);
    }

    return apiResponse.success(res, null, 'Attendee removed successfully');
  } catch (error) {
    logger.error('REMOVE_ATTENDEE_ERROR', {
      attendeeId: req.params.attendeeId,
      error: error.message,
    });
    return apiResponse.internalError(res, 'Failed to remove attendee', error);
  }
};
