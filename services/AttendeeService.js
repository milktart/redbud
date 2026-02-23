/**
 * Attendee Service
 *
 * Manages user attendance at trips and travel items with permission levels.
 *
 * Key concepts:
 * - Attendees are users associated with specific trips/items
 * - Permission levels: 'view', 'manage'
 * - Supports cascading: adding/removing attendees from trip cascades to all items
 * - Integrates with CompanionService for global permission checks
 */

const BaseService = require('./BaseService');
const { Attendee, User, Trip, Flight, Hotel, Event, Transportation, CarRental } = require('../models');
const { PERMISSION_LEVELS, ITEM_TYPES } = require('../constants/permissionConstants');
const CompanionService = require('./CompanionService');
const logger = require('../utils/logger');

class AttendeeService extends BaseService {
  constructor() {
    super(Attendee);
    this.companionService = new CompanionService();
  }

  /**
   * Add a user as an attendee to a trip/item
   * @param {string} itemType - Type of item ('trip', 'flight', 'hotel', etc.)
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID to add as attendee
   * @param {string} permissionLevel - Permission level ('view' or 'manage')
   * @param {string} addedBy - User ID who is adding this attendee
   * @returns {Promise<Object>} Created attendee record
   */
  async addAttendee(itemType, itemId, userId, permissionLevel, addedBy) {
    // Check if attendee already exists
    const existing = await Attendee.findOne({
      where: { userId, itemType, itemId },
    });

    if (existing) {
      throw new Error('User is already an attendee');
    }

    const attendee = await Attendee.create({
      userId,
      itemType,
      itemId,
      permissionLevel,
      addedBy,
    });

    // Load user data for response
    const result = await Attendee.findByPk(attendee.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
    });

    return result;
  }

  /**
   * Remove an attendee from a trip/item
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeAttendee(itemType, itemId, userId) {
    const deleted = await Attendee.destroy({
      where: { userId, itemType, itemId },
    });

    return deleted > 0;
  }

  /**
   * Update attendee permission level
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID
   * @param {string} permissionLevel - New permission level
   * @returns {Promise<Object>} Updated attendee record
   */
  async updateAttendeePermission(itemType, itemId, userId, permissionLevel) {
    const attendee = await Attendee.findOne({
      where: { userId, itemType, itemId },
    });

    if (!attendee) {
      throw new Error('Attendee not found');
    }

    attendee.permissionLevel = permissionLevel;
    await attendee.save();

    // Load user data for response
    const result = await Attendee.findByPk(attendee.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
    });

    return result;
  }

  /**
   * Get all attendees for a trip/item
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @returns {Promise<Array>} Array of attendees
   */
  async getAttendees(itemType, itemId) {
    return await Attendee.findAll({
      where: { itemType, itemId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Get specific attendee's permission level
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Permission level or null if not an attendee
   */
  async getAttendeePermission(itemType, itemId, userId) {
    const attendee = await Attendee.findOne({
      where: { userId, itemType, itemId },
      attributes: ['permissionLevel'],
    });

    return attendee ? attendee.permissionLevel : null;
  }

  /**
   * Bulk add attendees to a trip/item
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {Array<string>} userIds - Array of user IDs to add
   * @param {string} permissionLevel - Permission level for all
   * @param {string} addedBy - User ID who is adding
   * @returns {Promise<Array>} Array of created attendees
   */
  async bulkAddAttendees(itemType, itemId, userIds, permissionLevel, addedBy) {
    const attendees = [];

    for (const userId of userIds) {
      try {
        const attendee = await this.addAttendee(itemType, itemId, userId, permissionLevel, addedBy);
        attendees.push(attendee);
      } catch (error) {
        // Skip if already exists or error
        logger.warn('BULK_ADD_ATTENDEE_SKIPPED', {
          itemType,
          itemId,
          userId,
          error: error.message,
        });
      }
    }

    return attendees;
  }

  /**
   * Copy trip attendees to a new item in that trip
   * @param {string} tripId - Trip ID
   * @param {string} itemType - Type of item being created
   * @param {string} itemId - ID of the new item
   * @returns {Promise<Array>} Array of created attendees
   */
  async inheritTripAttendees(tripId, itemType, itemId) {
    // Get all trip attendees
    const tripAttendees = await Attendee.findAll({
      where: {
        itemType: ITEM_TYPES.TRIP,
        itemId: tripId,
      },
    });

    // Create attendees for the new item
    const itemAttendees = [];

    for (const tripAttendee of tripAttendees) {
      try {
        const attendee = await Attendee.create({
          userId: tripAttendee.userId,
          itemType,
          itemId,
          permissionLevel: tripAttendee.permissionLevel,
          addedBy: tripAttendee.addedBy,
        });
        itemAttendees.push(attendee);
      } catch (error) {
        logger.warn('INHERIT_TRIP_ATTENDEE_SKIPPED', {
          tripId,
          itemType,
          itemId,
          userId: tripAttendee.userId,
          error: error.message,
        });
      }
    }

    return itemAttendees;
  }

  /**
   * Add attendee to all existing items in a trip
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID to add
   * @param {string} permissionLevel - Permission level
   * @param {string} addedBy - User ID who is adding
   * @returns {Promise<Object>} Summary of added attendees
   */
  async cascadeAddToTripItems(tripId, userId, permissionLevel, addedBy) {
    const trip = await Trip.findByPk(tripId, {
      include: [
        { model: Flight, as: 'flights' },
        { model: Hotel, as: 'hotels' },
        { model: Event, as: 'events' },
        { model: Transportation, as: 'transportation' },
        { model: CarRental, as: 'carRentals' },
      ],
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    const added = {
      flights: [],
      hotels: [],
      events: [],
      transportation: [],
      carRentals: [],
    };

    // Add to all flights
    for (const flight of trip.flights || []) {
      try {
        const attendee = await this.addAttendee(ITEM_TYPES.FLIGHT, flight.id, userId, permissionLevel, addedBy);
        added.flights.push(attendee);
      } catch (error) {
        logger.warn('CASCADE_ADD_FLIGHT_SKIPPED', { flightId: flight.id, error: error.message });
      }
    }

    // Add to all hotels
    for (const hotel of trip.hotels || []) {
      try {
        const attendee = await this.addAttendee(ITEM_TYPES.HOTEL, hotel.id, userId, permissionLevel, addedBy);
        added.hotels.push(attendee);
      } catch (error) {
        logger.warn('CASCADE_ADD_HOTEL_SKIPPED', { hotelId: hotel.id, error: error.message });
      }
    }

    // Add to all events
    for (const event of trip.events || []) {
      try {
        const attendee = await this.addAttendee(ITEM_TYPES.EVENT, event.id, userId, permissionLevel, addedBy);
        added.events.push(attendee);
      } catch (error) {
        logger.warn('CASCADE_ADD_EVENT_SKIPPED', { eventId: event.id, error: error.message });
      }
    }

    // Add to all transportation
    for (const transport of trip.transportation || []) {
      try {
        const attendee = await this.addAttendee(ITEM_TYPES.TRANSPORTATION, transport.id, userId, permissionLevel, addedBy);
        added.transportation.push(attendee);
      } catch (error) {
        logger.warn('CASCADE_ADD_TRANSPORT_SKIPPED', { transportId: transport.id, error: error.message });
      }
    }

    // Add to all car rentals
    for (const carRental of trip.carRentals || []) {
      try {
        const attendee = await this.addAttendee(ITEM_TYPES.CAR_RENTAL, carRental.id, userId, permissionLevel, addedBy);
        added.carRentals.push(attendee);
      } catch (error) {
        logger.warn('CASCADE_ADD_CAR_RENTAL_SKIPPED', { carRentalId: carRental.id, error: error.message });
      }
    }

    return added;
  }

  /**
   * Remove attendee from all items in a trip
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID to remove
   * @returns {Promise<Object>} Summary of removed attendees
   */
  async cascadeRemoveFromTripItems(tripId, userId) {
    const trip = await Trip.findByPk(tripId, {
      include: [
        { model: Flight, as: 'flights' },
        { model: Hotel, as: 'hotels' },
        { model: Event, as: 'events' },
        { model: Transportation, as: 'transportation' },
        { model: CarRental, as: 'carRentals' },
      ],
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    const removed = {
      flights: 0,
      hotels: 0,
      events: 0,
      transportation: 0,
      carRentals: 0,
    };

    // Remove from all items
    for (const flight of trip.flights || []) {
      removed.flights += await Attendee.destroy({
        where: { userId, itemType: ITEM_TYPES.FLIGHT, itemId: flight.id },
      });
    }

    for (const hotel of trip.hotels || []) {
      removed.hotels += await Attendee.destroy({
        where: { userId, itemType: ITEM_TYPES.HOTEL, itemId: hotel.id },
      });
    }

    for (const event of trip.events || []) {
      removed.events += await Attendee.destroy({
        where: { userId, itemType: ITEM_TYPES.EVENT, itemId: event.id },
      });
    }

    for (const transport of trip.transportation || []) {
      removed.transportation += await Attendee.destroy({
        where: { userId, itemType: ITEM_TYPES.TRANSPORTATION, itemId: transport.id },
      });
    }

    for (const carRental of trip.carRentals || []) {
      removed.carRentals += await Attendee.destroy({
        where: { userId, itemType: ITEM_TYPES.CAR_RENTAL, itemId: carRental.id },
      });
    }

    return removed;
  }

  /**
   * Check if user can view a trip/item
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID checking access
   * @param {string} createdBy - Creator user ID
   * @param {string|null} tripId - Optional trip ID for fallback check
   * @returns {Promise<boolean>} True if can view
   */
  async canView(itemType, itemId, userId, createdBy, tripId = null) {
    // Creator can always view
    if (userId === createdBy) return true;

    // Check if user is an attendee
    const attendee = await Attendee.findOne({
      where: { userId, itemType, itemId },
      attributes: ['id'],
    });

    if (attendee) return true;

    // Fallback: trip-level attendee grants view on all trip items
    if (itemType !== ITEM_TYPES.TRIP && tripId) {
      const tripAttendee = await Attendee.findOne({
        where: { userId, itemType: ITEM_TYPES.TRIP, itemId: tripId },
        attributes: ['id'],
      });
      if (tripAttendee) return true;
    }

    // Check companion permissions (view or manage_all)
    return await this.companionService.canViewAllItems(userId, createdBy);
  }

  /**
   * Check if user can manage (edit) a trip/item
   * @param {string} itemType - Type of item
   * @param {string} itemId - ID of the trip/item
   * @param {string} userId - User ID checking access
   * @param {string} createdBy - Creator user ID
   * @param {string|null} tripId - Optional trip ID for fallback check
   * @returns {Promise<boolean>} True if can manage
   */
  async canManage(itemType, itemId, userId, createdBy, tripId = null) {
    // Creator can always manage
    if (userId === createdBy) return true;

    // Check if user is an attendee with manage permission
    const attendee = await Attendee.findOne({
      where: { userId, itemType, itemId },
      attributes: ['permissionLevel'],
    });

    if (attendee && attendee.permissionLevel === PERMISSION_LEVELS.ATTENDEE.MANAGE) {
      return true;
    }

    // Fallback: trip-level attendee with manage grants manage on all trip items
    if (itemType !== ITEM_TYPES.TRIP && tripId) {
      const tripAttendee = await Attendee.findOne({
        where: { userId, itemType: ITEM_TYPES.TRIP, itemId: tripId, permissionLevel: PERMISSION_LEVELS.ATTENDEE.MANAGE },
        attributes: ['id'],
      });
      if (tripAttendee) return true;
    }

    // Check companion permissions (manage_all only)
    return await this.companionService.canManageAllItems(userId, createdBy);
  }

  /**
   * Check if user can delete a trip/item
   * Only the creator can delete
   * @param {string} userId - User ID checking access
   * @param {string} createdBy - Creator user ID
   * @returns {boolean} True if can delete
   */
  canDelete(userId, createdBy) {
    return userId === createdBy;
  }
}

module.exports = AttendeeService;
