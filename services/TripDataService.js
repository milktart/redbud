/**
 * Trip Data Service
 * Pure data access layer for trip operations
 *
 * Phase 4 Refactoring: Extracted from tripService.js
 * - PURE data operations only (no business logic)
 * - No permission checks (business layer responsibility)
 * - No presentation enrichment (presentation layer responsibility)
 * - No caching (business layer responsibility)
 *
 * Responsibilities:
 * - Database queries for trips and related items
 * - CRUD operations on Trip model
 * - Query building and Sequelize operations
 * - Raw data retrieval
 */

const { Op } = require('sequelize');
const BaseService = require('./BaseService');
const {
  Trip,
  Flight,
  Hotel,
  Transportation,
  CarRental,
  Event,
  Attendee,
  Companion,
  User,
} = require('../models');
const logger = require('../utils/logger');

class TripDataService extends BaseService {
  constructor() {
    super(Trip, 'Trip');
  }

  /**
   * Get common include structure for trips
   * Includes all travel items and their user relationships
   * @returns {Array} Sequelize include array
   */
  getTripIncludes() {
    const userAttrs = { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] };
    return [
      userAttrs,
      {
        model: Flight,
        as: 'flights',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
      {
        model: Hotel,
        as: 'hotels',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
      {
        model: Transportation,
        as: 'transportation',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
      {
        model: CarRental,
        as: 'carRentals',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
      {
        model: Event,
        as: 'events',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
    ];
  }

  /**
   * Attach attendees to trips and their nested items in-place.
   * Fetches all attendee records for the given trip IDs in two queries
   * (one for trip-level, one for all item types) to avoid Sequelize's
   * broken alias generation when nesting polymorphic associations.
   * @param {Array} trips - Array of plain trip objects (already toJSON'd)
   */
  async attachAttendeesToTrips(trips) {
    if (!trips.length) return;

    const tripIds = trips.map((t) => t.id);

    // Collect all item IDs per type across all trips
    const itemIdsByType = { flight: [], hotel: [], transportation: [], car_rental: [], event: [] };
    for (const trip of trips) {
      for (const f of trip.flights || []) itemIdsByType.flight.push(f.id);
      for (const h of trip.hotels || []) itemIdsByType.hotel.push(h.id);
      for (const t of trip.transportation || []) itemIdsByType.transportation.push(t.id);
      for (const c of trip.carRentals || []) itemIdsByType.car_rental.push(c.id);
      for (const e of trip.events || []) itemIdsByType.event.push(e.id);
    }

    // Build one combined OR query for all relevant attendee records
    const orConditions = [
      { itemType: 'trip', itemId: { [Op.in]: tripIds } },
    ];
    for (const [type, ids] of Object.entries(itemIdsByType)) {
      if (ids.length) orConditions.push({ itemType: type, itemId: { [Op.in]: ids } });
    }

    const allAttendees = await Attendee.findAll({
      where: { [Op.or]: orConditions },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    });

    // Index by "itemType:itemId"
    const byKey = {};
    for (const att of allAttendees) {
      const key = `${att.itemType}:${att.itemId}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(att.toJSON ? att.toJSON() : att);
    }

    const get = (type, id) => byKey[`${type}:${id}`] || [];

    for (const trip of trips) {
      trip.attendees = get('trip', trip.id);
      for (const f of trip.flights || []) f.attendees = get('flight', f.id);
      for (const h of trip.hotels || []) h.attendees = get('hotel', h.id);
      for (const t of trip.transportation || []) t.attendees = get('transportation', t.id);
      for (const c of trip.carRentals || []) c.attendees = get('car_rental', c.id);
      for (const e of trip.events || []) e.attendees = get('event', e.id);
    }
  }

  // getTripItemsFromJunction method removed - items are now directly linked to trips via tripId foreign key

  /**
   * Get trips owned by a user with optional filtering
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {Object} options.dateFilter - Sequelize date filter
   * @param {string} options.orderDirection - 'ASC' or 'DESC'
   * @param {number} options.limit - Result limit
   * @param {number} options.offset - Result offset
   * @param {boolean} options.includeItems - Include travel items (default: true)
   * @returns {Promise<Array>} Array of Trip instances
   */
  async getUserOwnedTrips(userId, options = {}) {
    const {
      dateFilter = {},
      orderDirection = 'ASC',
      limit,
      offset,
      includeItems = true,
    } = options;

    const queryOptions = {
      where: { userId, ...dateFilter },
      order: [['departureDate', orderDirection]],
    };

    if (includeItems) {
      queryOptions.include = this.getTripIncludes();
    }

    if (limit !== undefined) {
      queryOptions.limit = limit;
    }

    if (offset !== undefined) {
      queryOptions.offset = offset;
    }

    return await Trip.findAll(queryOptions);
  }

  /**
   * Count trips owned by a user with optional filtering
   * @param {string} userId - User ID
   * @param {Object} dateFilter - Sequelize date filter
   * @returns {Promise<number>} Count of trips
   */
  async countUserOwnedTrips(userId, dateFilter = {}) {
    return await Trip.count({
      where: { userId, ...dateFilter },
    });
  }

  /**
   * Get trips where user is an attendee (shared trips) but does not own them
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {Object} options.dateFilter - Sequelize date filter
   * @param {string} options.orderDirection - 'ASC' or 'DESC'
   * @returns {Promise<Array>} Array of Trip instances
   */
  async getAttendeeTrips(userId, options = {}) {
    const { dateFilter = {}, orderDirection = 'ASC' } = options;

    const attendeeRecords = await Attendee.findAll({
      where: { userId, itemType: 'trip' },
      attributes: ['itemId'],
      raw: true,
    });

    const tripIds = attendeeRecords.map((a) => a.itemId);
    if (tripIds.length === 0) return [];

    return await Trip.findAll({
      where: {
        id: { [Op.in]: tripIds },
        userId: { [Op.ne]: userId }, // exclude trips they also own
        ...dateFilter,
      },
      include: this.getTripIncludes(),
      order: [['departureDate', orderDirection]],
    });
  }

  /**
   * Get standalone items owned by a user (not associated with any trip)
   * @param {string} userId - User ID
   * @param {Object} dateFilter - Sequelize date filter
   * @returns {Promise<Object>} { flights, hotels, transportation, carRentals, events }
   */
  async getStandaloneItems(userId, dateFilter = {}) {
    const userInclude = [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
      {
        model: Attendee,
        as: 'attendees',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      },
    ];

    const [flights, hotels, transportation, carRentals, events] = await Promise.all([
      Flight.findAll({
        where: {
          userId,
          tripId: null,
          ...(dateFilter.departureDate && {
            departureDateTime: { [Op.gte]: dateFilter.departureDate },
          }),
        },
        include: userInclude,
        order: [['departureDateTime', 'ASC']],
      }),
      Hotel.findAll({
        where: {
          userId,
          tripId: null,
          ...(dateFilter.departureDate && {
            checkOutDateTime: { [Op.gte]: dateFilter.departureDate },
          }),
        },
        include: userInclude,
        order: [['checkInDateTime', 'ASC']],
      }),
      Transportation.findAll({
        where: {
          userId,
          tripId: null,
          ...(dateFilter.departureDate && {
            departureDateTime: { [Op.gte]: dateFilter.departureDate },
          }),
        },
        include: userInclude,
        order: [['departureDateTime', 'ASC']],
      }),
      CarRental.findAll({
        where: {
          userId,
          tripId: null,
          ...(dateFilter.departureDate && {
            pickupDateTime: { [Op.gte]: dateFilter.departureDate },
          }),
        },
        include: userInclude,
        order: [['pickupDateTime', 'ASC']],
      }),
      Event.findAll({
        where: {
          userId,
          tripId: null,
          ...(dateFilter.departureDate && {
            startDateTime: { [Op.gte]: dateFilter.departureDate },
          }),
        },
        include: userInclude,
        order: [['startDateTime', 'ASC']],
      }),
    ]);

    return { flights, hotels, transportation, carRentals, events };
  }

  /**
   * Get a trip by ID with all related items
   * @param {string} tripId - Trip ID
   * @param {boolean} includeItems - Include travel items (default: true)
   * @returns {Promise<Object|null>} Trip instance or null
   */
  async getTripById(tripId, includeItems = true) {
    const options = { where: { id: tripId } };
    if (includeItems) {
      options.include = this.getTripIncludes();
    }
    return await Trip.findOne(options);
  }

  /**
   * Get a trip by ID with ownership verification
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID
   * @param {boolean} includeItems - Include travel items (default: false)
   * @returns {Promise<Object|null>} Trip instance or null
   */
  async getTripByIdAndUserId(tripId, userId, includeItems = false) {
    const options = { where: { id: tripId, userId } };
    if (includeItems) {
      options.include = this.getTripIncludes();
    }
    return await Trip.findOne(options);
  }

  /**
   * Create a new trip
   * @param {Object} data - Trip data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created Trip instance
   */
  async createTrip(data, userId) {
    const AttendeeService = require('./AttendeeService');
    const attendeeService = new AttendeeService();

    const tripData = {
      ...data,
      userId,
      createdBy: userId, // Set creator
    };
    const trip = await this.create(tripData);

    // Add creator as attendee with manage permission
    await attendeeService.addAttendee('trip', trip.id, userId, 'manage', userId);

    logger.info('TRIP_CREATED', { tripId: trip.id, userId });
    return trip;
  }

  /**
   * Update a trip
   * @param {Object} trip - Trip instance
   * @param {Object} data - Updated trip data
   * @returns {Promise<Object>} Updated Trip instance
   */
  async updateTrip(trip, data) {
    await this.update(trip, data);
    logger.info('TRIP_UPDATED', { tripId: trip.id, userId: trip.userId });
    return trip;
  }

  /**
   * Delete a trip and its companions
   * @param {Object} trip - Trip instance
   * @returns {Promise<boolean>} Success status
   */
  async deleteTrip(trip) {
    await this.delete(trip);
    logger.info('TRIP_DELETED', { tripId: trip.id, userId: trip.userId });
    return true;
  }

  /**
   * Count trips for a user with optional date filter
   * @param {string} userId - User ID
   * @param {Object} dateFilter - Sequelize date filter
   * @returns {Promise<number>} Count of trips
   */
  async countTrips(userId, dateFilter = {}) {
    return await Trip.count({
      where: { userId, ...dateFilter },
    });
  }

  /**
   * Get trips shared by companions who have granted this user view access
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {Object} options.dateFilter - Sequelize date filter
   * @param {string} options.orderDirection - 'ASC' or 'DESC'
   * @returns {Promise<Array>} Array of Trip instances
   */
  async getCompanionSharedTrips(userId, options = {}) {
    const { dateFilter = {}, orderDirection = 'ASC' } = options;

    const companionRecords = await Companion.findAll({
      where: {
        companionUserId: userId,
        permissionLevel: { [Op.in]: ['view', 'manage_all'] },
      },
      attributes: ['userId'],
      raw: true,
    });

    const sharingUserIds = companionRecords.map((c) => c.userId);
    if (sharingUserIds.length === 0) return [];

    return await Trip.findAll({
      where: {
        userId: { [Op.in]: sharingUserIds, [Op.ne]: userId },
        ...dateFilter,
      },
      include: this.getTripIncludes(),
      order: [['departureDate', orderDirection]],
    });
  }

  /**
   * Get standalone items owned by companions who have granted this user view access
   * @param {string} userId - User ID
   * @returns {Promise<Object>} { flights, hotels, transportation, carRentals, events }
   */
  async getCompanionStandaloneItems(userId) {
    const companionRecords = await Companion.findAll({
      where: {
        companionUserId: userId,
        permissionLevel: { [Op.in]: ['view', 'manage_all'] },
      },
      attributes: ['userId'],
      raw: true,
    });

    const sharingUserIds = companionRecords.map((c) => c.userId);
    if (sharingUserIds.length === 0) {
      return { flights: [], hotels: [], transportation: [], carRentals: [], events: [] };
    }

    const ownerWhere = { userId: { [Op.in]: sharingUserIds }, tripId: null };
    const userInclude = [
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: Attendee, as: 'attendees', include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }] },
    ];

    const [flights, hotels, transportation, carRentals, events] = await Promise.all([
      Flight.findAll({ where: ownerWhere, include: userInclude, order: [['departureDateTime', 'ASC']] }),
      Hotel.findAll({ where: ownerWhere, include: userInclude, order: [['checkInDateTime', 'ASC']] }),
      Transportation.findAll({ where: ownerWhere, include: userInclude, order: [['departureDateTime', 'ASC']] }),
      CarRental.findAll({ where: ownerWhere, include: userInclude, order: [['pickupDateTime', 'ASC']] }),
      Event.findAll({ where: ownerWhere, include: userInclude, order: [['startDateTime', 'ASC']] }),
    ]);

    return { flights, hotels, transportation, carRentals, events };
  }

  /**
   * Get standalone items (tripId: null) where the user has been added as an attendee
   * @param {string} userId - User ID
   * @returns {Promise<Object>} { flights, hotels, transportation, carRentals, events }
   */
  async getAttendeeStandaloneItems(userId) {
    const userInclude = [
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: Attendee, as: 'attendees', include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }] },
    ];

    // Find all attendee records for this user on non-trip item types
    const attendeeRecords = await Attendee.findAll({
      where: {
        userId,
        itemType: { [Op.in]: ['flight', 'hotel', 'transportation', 'car_rental', 'event'] },
      },
      attributes: ['itemType', 'itemId'],
      raw: true,
    });

    if (attendeeRecords.length === 0) {
      return { flights: [], hotels: [], transportation: [], carRentals: [], events: [] };
    }

    // Group item IDs by type
    const idsByType = { flight: [], hotel: [], transportation: [], car_rental: [], event: [] };
    for (const record of attendeeRecords) {
      idsByType[record.itemType].push(record.itemId);
    }

    const [flights, hotels, transportation, carRentals, events] = await Promise.all([
      idsByType.flight.length ? Flight.findAll({ where: { id: { [Op.in]: idsByType.flight }, tripId: null, userId: { [Op.ne]: userId } }, include: userInclude }) : [],
      idsByType.hotel.length ? Hotel.findAll({ where: { id: { [Op.in]: idsByType.hotel }, tripId: null, userId: { [Op.ne]: userId } }, include: userInclude }) : [],
      idsByType.transportation.length ? Transportation.findAll({ where: { id: { [Op.in]: idsByType.transportation }, tripId: null, userId: { [Op.ne]: userId } }, include: userInclude }) : [],
      idsByType.car_rental.length ? CarRental.findAll({ where: { id: { [Op.in]: idsByType.car_rental }, tripId: null, userId: { [Op.ne]: userId } }, include: userInclude }) : [],
      idsByType.event.length ? Event.findAll({ where: { id: { [Op.in]: idsByType.event }, tripId: null, userId: { [Op.ne]: userId } }, include: userInclude }) : [],
    ]);

    return { flights, hotels, transportation, carRentals, events };
  }

  /**
   * Search trips by name or destination
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   * @returns {Promise<Array>} Array of Trip instances
   */
  async searchTrips(userId, query, limit = 10) {
    return await Trip.findAll({
      where: {
        userId,
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { destination: { [Op.iLike]: `%${query}%` } },
        ],
      },
      order: [['departureDate', 'DESC']],
      limit,
    });
  }
}

module.exports = TripDataService;
