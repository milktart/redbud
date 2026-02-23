/**
 * Trip Business Service
 * Business logic and orchestration for trip operations
 *
 * Phase 4 Refactoring: Extracted from tripService.js
 * - Business logic and orchestration
 * - Permission enforcement
 * - Transaction management
 * - Calls TripDataService for data access
 * - NO presentation enrichment (use TripPresentationService)
 *
 * Responsibilities:
 * - Coordinate between data and presentation layers
 * - Enforce business rules
 * - Handle caching invalidation
 * - Permission verification
 * - Complex queries and filtering
 */

const { Op } = require('sequelize');
const TripDataService = require('../TripDataService');
const PermissionService = require('../PermissionService');
const cacheService = require('../cacheService');
const logger = require('../../utils/logger');

class TripBusinessService {
  constructor() {
    this.tripDataService = new TripDataService();
    this.permissionService = new PermissionService();
  }

  /**
   * Get trips for a user with filtering and pagination
   * Returns raw data (use TripPresentationService for UI enrichment)
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {string} options.filter - 'upcoming', 'past', or 'all'
   * @param {number} options.page - Page number (for past trips)
   * @param {number} options.limit - Items per page (for past trips)
   * @returns {Promise<Object>} { ownedTrips, companionTrips, standalone, totalCount }
   */
  async getUserTrips(userId, options = {}) {
    const { filter = 'upcoming', page = 1, limit = 20 } = options;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build date filter
    let dateFilter = {};
    let orderDirection = 'ASC';

    if (filter === 'upcoming') {
      dateFilter = { departureDate: { [Op.gte]: today } };
      orderDirection = 'ASC'; // Soonest first
    } else if (filter === 'past') {
      dateFilter = { returnDate: { [Op.lt]: today } };
      orderDirection = 'DESC'; // Most recent first
    }

    // Get owned trips (with pagination for past trips)
    const queryOptions = {
      dateFilter,
      orderDirection,
      includeItems: true,
    };

    if (filter === 'past') {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
    }

    const [ownedTrips, totalCount] = await Promise.all([
      this.tripDataService.getUserOwnedTrips(userId, queryOptions),
      filter === 'past'
        ? this.tripDataService.countUserOwnedTrips(userId, dateFilter)
        : Promise.resolve(0),
    ]);

    // Get trips where the user is an attendee but not the owner
    const attendeeTrips = await this.tripDataService.getAttendeeTrips(userId, {
      dateFilter,
      orderDirection,
    });

    // Get trips from companions who have granted this user view access
    const companionSharedTrips = await this.tripDataService.getCompanionSharedTrips(userId, {
      dateFilter,
      orderDirection,
    });

    // Get standalone items (items not associated with any trip)
    const standaloneFilter = {};
    if (filter === 'upcoming') {
      standaloneFilter.departureDate = today;
    }

    const [standaloneItems, companionStandaloneItems, attendeeStandaloneItems] = await Promise.all([
      this.tripDataService.getStandaloneItems(userId, standaloneFilter),
      this.tripDataService.getCompanionStandaloneItems(userId),
      this.tripDataService.getAttendeeStandaloneItems(userId),
    ]);

    // Convert Sequelize instances to plain objects so attendees can be attached
    const toPlain = (trips) => trips.map((t) => (t.toJSON ? t.toJSON() : t));
    const plainOwned = toPlain(ownedTrips);
    const plainAttendee = toPlain(attendeeTrips);
    const plainCompanion = toPlain(companionSharedTrips);

    // Attach attendees to trips and their nested items in a single batch query per group
    await Promise.all([
      this.tripDataService.attachAttendeesToTrips(plainOwned),
      this.tripDataService.attachAttendeesToTrips(plainAttendee),
      this.tripDataService.attachAttendeesToTrips(plainCompanion),
    ]);

    return {
      ownedTrips: plainOwned,
      // Trips explicitly shared with me as an attendee — belong on MY timeline
      attendeeTrips: plainAttendee,
      // Trips from companions who shared their whole library — belong on FRIENDS timeline
      companionTrips: plainCompanion,
      // My own standalone items
      standalone: standaloneItems,
      // Standalone items I was added to as an attendee — belong on MY timeline
      attendeeStandalone: attendeeStandaloneItems,
      // Standalone items from companions who shared their library — belong on FRIENDS timeline
      companionStandalone: companionStandaloneItems,
      totalCount,
    };
  }

  /**
   * Get a trip with all details and permission checks
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID (for permission verification)
   * @returns {Promise<Object|null>} Trip with details or null if not found/no access
   */
  async getTripWithDetails(tripId, userId) {
    const trip = await this.tripDataService.getTripById(tripId, true);

    if (!trip) {
      logger.warn('TRIP_NOT_FOUND', { tripId });
      return null;
    }

    // Verify ownership, attendee, or companion view access
    const canView = await this.permissionService.canViewTripAsync(trip, userId);
    if (!canView) {
      logger.warn('TRIP_ACCESS_DENIED', { tripId, userId });
      return null;
    }

    return trip;
  }

  /**
   * Create a new trip
   * @param {Object} data - Trip data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created trip
   */
  async createTrip(data, userId) {
    const trip = await this.tripDataService.createTrip(data, userId);

    // Invalidate user caches
    await cacheService.invalidateUserTrips(userId);
    await cacheService.invalidateTripStats(userId);

    return trip;
  }

  /**
   * Update a trip
   * @param {string} tripId - Trip ID
   * @param {Object} data - Updated trip data
   * @param {string} userId - User ID (for permission verification)
   * @returns {Promise<Object|null>} Updated trip or null if not found/no access
   */
  async updateTrip(tripId, data, userId) {
    const trip = await this.tripDataService.getTripByIdAndUserId(tripId, userId, false);

    if (!trip) {
      logger.warn('TRIP_UPDATE_FAILED_NOT_FOUND', { tripId, userId });
      return null;
    }

    // Verify permission to edit
    if (!this.permissionService.canEditTrip(trip, userId)) {
      logger.warn('TRIP_UPDATE_PERMISSION_DENIED', { tripId, userId });
      return null;
    }

    const updatedTrip = await this.tripDataService.updateTrip(trip, data);

    // Invalidate caches
    await cacheService.invalidateUserTrips(userId);
    await cacheService.invalidateTripDetails(tripId);
    await cacheService.invalidateTripStats(userId);

    return updatedTrip;
  }

  /**
   * Delete a trip
   * @param {string} tripId - Trip ID
   * @param {string} userId - User ID (for permission verification)
   * @returns {Promise<boolean>} Success status
   */
  async deleteTrip(tripId, userId) {
    const trip = await this.tripDataService.getTripByIdAndUserId(tripId, userId, false);

    if (!trip) {
      logger.warn('TRIP_DELETE_FAILED_NOT_FOUND', { tripId, userId });
      return false;
    }

    // Verify permission to delete
    if (!this.permissionService.canDeleteTrip(trip, userId)) {
      logger.warn('TRIP_DELETE_PERMISSION_DENIED', { tripId, userId });
      return false;
    }

    await this.tripDataService.deleteTrip(trip);

    // Invalidate caches
    await cacheService.invalidateUserTrips(userId);
    await cacheService.invalidateTripDetails(tripId);
    await cacheService.invalidateTripStats(userId);

    return true;
  }

  /**
   * Get trip statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Trip statistics
   */
  async getTripStatistics(userId) {
    // Try to get from cache first
    const cached = await cacheService.getCachedTripStats(userId);
    if (cached) {
      return cached;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalTrips, upcomingTrips, pastTrips, activeTrips] = await Promise.all([
      this.tripDataService.countTrips(userId, {}),
      this.tripDataService.countTrips(userId, { departureDate: { [Op.gte]: today } }),
      this.tripDataService.countTrips(userId, { returnDate: { [Op.lt]: today } }),
      this.tripDataService.countTrips(userId, {
        departureDate: { [Op.lte]: today },
        returnDate: { [Op.gte]: today },
      }),
    ]);

    const result = {
      totalTrips,
      upcomingTrips,
      pastTrips,
      activeTrips,
    };

    // Cache the result
    await cacheService.cacheTripStats(userId, result);

    return result;
  }

  /**
   * Search trips by name or destination
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   * @returns {Promise<Array>} Array of matching trips
   */
  async searchTrips(userId, query, limit = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    return await this.tripDataService.searchTrips(userId, query.trim(), limit);
  }
}

module.exports = TripBusinessService;
