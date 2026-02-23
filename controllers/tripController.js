/**
 * Trip Controller
 * Handles HTTP requests for trip management
 *
 * Phase 4 Refactoring: Uses new service trio
 * - TripBusinessService for business logic
 * - TripPresentationService for UI enrichment
 * - No direct data access
 *
 * Delegates business logic to TripBusinessService.
 * Uses TripPresentationService to enrich responses for UI.
 *
 * Responsibilities:
 * - HTTP request/response handling
 * - Error formatting for API responses
 * - Presentation layer enrichment
 */

const TripBusinessService = require('../services/business/TripBusinessService');
const TripPresentationService = require('../services/presentation/TripPresentationService');
const PermissionService = require('../services/PermissionService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const tripBusinessService = new TripBusinessService();
const tripPresentationService = new TripPresentationService();
const permissionService = new PermissionService();

/**
 * GET /api/v1/trips
 * Get all trips for the authenticated user
 */
exports.getUserTrips = async (req, res) => {
  try {
    const { filter = 'upcoming', page = 1, limit = 20 } = req.query;

    const result = await tripBusinessService.getUserTrips(req.user.id, {
      filter,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    // Enrich with presentation data
    const enriched = tripPresentationService.enrichUserTripsResponse(result, req.user.id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalCount: result.totalCount,
      filter,
    });

    // My trips: owned + attendee (explicitly added to)
    const myTripIds = new Set();
    const trips = [];
    for (const trip of [...enriched.ownedTrips, ...enriched.attendeeTrips]) {
      if (!myTripIds.has(trip.id)) {
        myTripIds.add(trip.id);
        trips.push(trip);
      }
    }

    // Friends trips: companion-shared only (not attendee)
    const friendsTrips = enriched.companionTrips.filter(t => !myTripIds.has(t.id));

    // If past trips with pagination, return paginated response
    if (filter === 'past' && enriched.pagination.totalPages > 1) {
      return apiResponse.paginated(
        res,
        trips,
        enriched.pagination,
        `Retrieved ${trips.length} ${filter} trips`
      );
    }

    return apiResponse.success(
      res,
      {
        trips,
        friendsTrips,
        standalone: enriched.standalone,
        attendeeStandalone: enriched.attendeeStandalone,
        companionStandalone: enriched.companionStandalone,
      },
      `Retrieved ${trips.length} ${filter} trips`
    );
  } catch (error) {
    logger.error('GET_USER_TRIPS_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve trips', error);
  }
};

/**
 * GET /api/v1/trips/stats
 * Get trip statistics for the authenticated user
 */
exports.getTripStatistics = async (req, res) => {
  try {
    const stats = await tripBusinessService.getTripStatistics(req.user.id);
    return apiResponse.success(res, stats, 'Trip statistics retrieved');
  } catch (error) {
    logger.error('GET_TRIP_STATS_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve trip statistics', error);
  }
};

/**
 * GET /api/v1/trips/search
 * Search trips by name or destination
 */
exports.searchTrips = async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;

    if (!query || query.length < 2) {
      return apiResponse.badRequest(res, 'Search query must be at least 2 characters');
    }

    const trips = await tripBusinessService.searchTrips(req.user.id, query, parseInt(limit, 10));

    // Enrich trips for presentation
    const enriched = tripPresentationService.enrichTrips(trips, req.user.id);

    return apiResponse.success(res, enriched, `Found ${enriched.length} trips`);
  } catch (error) {
    logger.error('SEARCH_TRIPS_ERROR', { userId: req.user.id, query: req.query.q, error: error.message });
    return apiResponse.internalError(res, 'Failed to search trips', error);
  }
};

/**
 * GET /api/v1/trips/:id
 * Get a specific trip with all details
 */
exports.getTrip = async (req, res) => {
  try {
    const trip = await tripBusinessService.getTripWithDetails(req.params.id, req.user.id);

    if (!trip) {
      return apiResponse.notFound(res, 'Trip not found or access denied');
    }

    // Determine manage permission for item-level edit flags
    const canManage = await permissionService.canManageTripAsync(trip, req.user.id);

    // Enrich for presentation
    const enriched = tripPresentationService.enrichTrip(trip, req.user.id, { canManage });

    return apiResponse.success(res, enriched, 'Trip retrieved successfully');
  } catch (error) {
    logger.error('GET_TRIP_ERROR', { tripId: req.params.id, userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve trip', error);
  }
};

/**
 * POST /api/v1/trips
 * Create a new trip
 */
exports.createTrip = async (req, res) => {
  try {
    const trip = await tripBusinessService.createTrip(req.body, req.user.id);

    // Enrich for presentation
    const enriched = tripPresentationService.enrichTrip(trip, req.user.id);

    return apiResponse.created(res, enriched, 'Trip created successfully');
  } catch (error) {
    logger.error('CREATE_TRIP_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to create trip', error);
  }
};

/**
 * PUT /api/v1/trips/:id
 * Update an existing trip
 */
exports.updateTrip = async (req, res) => {
  try {
    const trip = await tripBusinessService.updateTrip(req.params.id, req.body, req.user.id);

    if (!trip) {
      return apiResponse.notFound(res, 'Trip not found or access denied');
    }

    // Enrich for presentation
    const enriched = tripPresentationService.enrichTrip(trip, req.user.id);

    return apiResponse.success(res, enriched, 'Trip updated successfully');
  } catch (error) {
    logger.error('UPDATE_TRIP_ERROR', { tripId: req.params.id, userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to update trip', error);
  }
};

/**
 * DELETE /api/v1/trips/:id
 * Delete a trip
 */
exports.deleteTrip = async (req, res) => {
  try {
    const success = await tripBusinessService.deleteTrip(req.params.id, req.user.id);

    if (!success) {
      return apiResponse.notFound(res, 'Trip not found or access denied');
    }

    return apiResponse.noContent(res);
  } catch (error) {
    logger.error('DELETE_TRIP_ERROR', { tripId: req.params.id, userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to delete trip', error);
  }
};
