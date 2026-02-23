/**
 * User Controller
 *
 * Handles user management HTTP requests (admin functions).
 * Delegates business logic to UserBusinessService.
 *
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation (basic)
 * - Error formatting for API responses
 *
 * Business logic is in: services/business/UserBusinessService.js
 */

const UserBusinessService = require('../services/business/UserBusinessService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const duplicateDetectionService = require('../services/duplicateDetectionService');

const userService = new UserBusinessService();

/**
 * GET /users
 * Get all users (admin only)
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    return apiResponse.success(res, { users }, 'Users retrieved successfully');
  } catch (error) {
    logger.error('GET_ALL_USERS_ERROR', { error: error.message });
    return apiResponse.internalError(res, 'Error fetching users', error);
  }
};

/**
 * POST /users
 * Create a new user (admin only)
 */
exports.createUser = async (req, res) => {
  try {
    const { email, firstName, lastName, password, isAdmin } = req.body;

    const user = await userService.createUser({
      email,
      firstName,
      lastName,
      password,
      isAdmin,
    });

    return apiResponse.created(res, { user }, 'User created successfully');
  } catch (error) {
    logger.error('CREATE_USER_ERROR', { error: error.message });

    // Handle validation errors
    if (error.statusCode === 400) {
      return apiResponse.badRequest(res, error.message);
    }

    return apiResponse.internalError(res, 'Error creating user', error);
  }
};

/**
 * PUT /users/:id
 * Update a user (admin only)
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, isAdmin, password } = req.body;

    const user = await userService.updateUser(id, {
      firstName,
      lastName,
      isAdmin,
      password,
    });

    return apiResponse.success(res, { user }, 'User updated successfully');
  } catch (error) {
    logger.error('UPDATE_USER_ERROR', { userId: req.params.id, error: error.message });

    // Handle specific errors
    if (error.statusCode === 404) {
      return apiResponse.notFound(res, error.message);
    }

    if (error.statusCode === 400) {
      return apiResponse.badRequest(res, error.message);
    }

    return apiResponse.internalError(res, 'Error updating user', error);
  }
};

/**
 * DELETE /users/:id
 * Deactivate a user (soft delete) - admin only
 */
exports.deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    await userService.deactivateUser(id, req.user.id);

    return apiResponse.success(res, null, 'User account deactivated');
  } catch (error) {
    logger.error('DEACTIVATE_USER_ERROR', { userId: req.params.id, error: error.message });

    // Handle specific errors
    if (error.statusCode === 404) {
      return apiResponse.notFound(res, error.message);
    }

    if (error.statusCode === 403) {
      return apiResponse.forbidden(res, error.message);
    }

    return apiResponse.internalError(res, 'Error deactivating user', error);
  }
};

/**
 * GET /users/:id
 * Get user by ID (admin only)
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await userService.getUserById(id);

    return apiResponse.success(res, { user }, 'User retrieved successfully');
  } catch (error) {
    logger.error('GET_USER_ERROR', { userId: req.params.id, error: error.message });

    if (error.statusCode === 404) {
      return apiResponse.notFound(res, error.message);
    }

    return apiResponse.internalError(res, 'Error fetching user', error);
  }
};

/**
 * PUT /users/me
 * Update the authenticated user's own profile
 */
exports.updateMe = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    const user = await userService.updateMe(req.user.id, { firstName, lastName, phone });

    return apiResponse.success(res, { user }, 'Profile updated successfully');
  } catch (error) {
    logger.error('UPDATE_ME_ERROR', { userId: req.user?.id, error: error.message });

    if (error.statusCode === 400) {
      return apiResponse.badRequest(res, error.message);
    }

    return apiResponse.internalError(res, 'Error updating profile', error);
  }
};

/**
 * GET /users/export
 * Export authenticated user's account data (trips and items)
 */
exports.exportData = async (req, res) => {
  try {
    const { Trip, Flight, Hotel, Transportation, CarRental, Event } = require('../models');
    const userId = req.user.id;

    const trips = await Trip.findAll({
      where: { userId },
      include: [
        { model: Flight, as: 'flights', required: false },
        { model: Hotel, as: 'hotels', required: false },
        { model: Transportation, as: 'transportation', required: false },
        { model: CarRental, as: 'carRentals', required: false },
        { model: Event, as: 'events', required: false },
      ],
      order: [['departureDate', 'ASC']],
    });

    const tripsData = trips.map((trip) => {
      const t = trip.toJSON();
      return {
        id: t.id,
        name: t.name,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        purpose: t.purpose,
        flights: t.flights ?? [],
        hotels: t.hotels ?? [],
        transportation: t.transportation ?? [],
        carRentals: t.carRentals ?? [],
        events: t.events ?? [],
      };
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      trips: tripsData,
    };
    res.setHeader('Content-Disposition', 'attachment; filename="travel-data.json"');
    res.setHeader('Content-Type', 'application/json');
    return res.json(exportData);
  } catch (error) {
    logger.error('EXPORT_DATA_ERROR', { userId: req.user?.id, error: error.message });
    return apiResponse.internalError(res, 'Error exporting data', error);
  }
};

/**
 * POST /users/import/preview
 * Preview import data — annotates each trip/item with duplicate detection results.
 * Does NOT write anything to the database.
 */
exports.importPreview = async (req, res) => {
  try {
    const { Trip, Flight, Hotel, Transportation, CarRental, Event } = require('../models');
    const userId = req.user.id;
    const { trips: importedTrips } = req.body;

    if (!Array.isArray(importedTrips)) {
      return apiResponse.badRequest(res, 'Request body must contain a "trips" array');
    }

    // Load all existing data for the current user (same query as exportData)
    const existingTrips = await Trip.findAll({
      where: { userId },
      include: [
        { model: Flight, as: 'flights', required: false },
        { model: Hotel, as: 'hotels', required: false },
        { model: Transportation, as: 'transportation', required: false },
        { model: CarRental, as: 'carRentals', required: false },
        { model: Event, as: 'events', required: false },
      ],
    });

    // Flatten all existing items per type for cross-trip duplicate checking
    const allExistingFlights = existingTrips.flatMap((t) => t.flights ?? []);
    const allExistingHotels = existingTrips.flatMap((t) => t.hotels ?? []);
    const allExistingTransportation = existingTrips.flatMap((t) => t.transportation ?? []);
    const allExistingCarRentals = existingTrips.flatMap((t) => t.carRentals ?? []);
    const allExistingEvents = existingTrips.flatMap((t) => t.events ?? []);

    const annotatedTrips = importedTrips.map((trip, tripIndex) => {
      const tripDup = duplicateDetectionService.checkTripDuplicates(trip, existingTrips);

      const annotateItems = (items, checkFn, existingItems) =>
        (items ?? []).map((item, itemIndex) => {
          const dup = checkFn(item, existingItems);
          return {
            ...item,
            _importIndex: itemIndex,
            isDuplicate: dup.isDuplicate,
            duplicateOf: dup.isDuplicate
              ? { id: dup.duplicateOf?.id, name: dup.duplicateOf?.name ?? dup.duplicateOf?.hotelName ?? dup.duplicateOf?.flightNumber ?? dup.duplicateOf?.pickupLocation }
              : null,
          };
        });

      return {
        ...trip,
        _importIndex: tripIndex,
        isDuplicate: tripDup.isDuplicate,
        duplicateOf: tripDup.isDuplicate
          ? { id: tripDup.duplicateOf?.id, name: tripDup.duplicateOf?.name }
          : null,
        flights: annotateItems(trip.flights, duplicateDetectionService.checkFlightDuplicates, allExistingFlights),
        hotels: annotateItems(trip.hotels, duplicateDetectionService.checkHotelDuplicates, allExistingHotels),
        transportation: annotateItems(trip.transportation, duplicateDetectionService.checkTransportationDuplicates, allExistingTransportation),
        carRentals: annotateItems(trip.carRentals, duplicateDetectionService.checkCarRentalDuplicates, allExistingCarRentals),
        events: annotateItems(trip.events, duplicateDetectionService.checkEventDuplicates, allExistingEvents),
      };
    });

    return apiResponse.success(res, { trips: annotatedTrips }, 'Preview generated');
  } catch (error) {
    logger.error('IMPORT_PREVIEW_ERROR', { userId: req.user?.id, error: error.message });
    return apiResponse.internalError(res, 'Error generating import preview', error);
  }
};

/**
 * POST /users/import/execute
 * Execute the import — creates selected trips and items.
 * Body: { trips: [{ tripData, selected, items: { flights: [{data, selected}], ... } }] }
 */
exports.executeImport = async (req, res) => {
  try {
    const { Trip, Flight, Hotel, Transportation, CarRental, Event } = require('../models');
    const userId = req.user.id;
    const { trips: importTrips } = req.body;

    if (!Array.isArray(importTrips)) {
      return apiResponse.badRequest(res, 'Request body must contain a "trips" array');
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const ITEM_MODELS = {
      flights: { model: Flight, as: 'flights' },
      hotels: { model: Hotel, as: 'hotels' },
      transportation: { model: Transportation, as: 'transportation' },
      carRentals: { model: CarRental, as: 'carRentals' },
      events: { model: Event, as: 'events' },
    };

    for (const tripEntry of importTrips) {
      const { tripData, selected: tripSelected, items: itemsMap = {} } = tripEntry;

      let newTripId = null;

      if (tripSelected) {
        try {
          // Strip export-only fields before creating
          const { id, userId: _uid, createdBy: _cby, createdAt, updatedAt, ...cleanTripData } = tripData;
          const newTrip = await Trip.create({ ...cleanTripData, userId, createdBy: userId });
          newTripId = newTrip.id;
          imported++;
        } catch (err) {
          errors.push({ type: 'trip', name: tripData.name, error: err.message });
          skipped++;
          // Skip items if trip creation failed
          continue;
        }
      } else {
        skipped++;
        // Still allow items to be imported standalone (with original tripId or null)
        newTripId = null;
      }

      // Import items
      for (const [itemType, itemEntries] of Object.entries(itemsMap)) {
        const modelEntry = ITEM_MODELS[itemType];
        if (!modelEntry) continue;

        for (const itemEntry of itemEntries) {
          const { data: itemData, selected: itemSelected } = itemEntry;
          if (!itemSelected) { skipped++; continue; }

          try {
            const { id, tripId: _tid, createdAt, updatedAt, ...cleanItemData } = itemData;
            await modelEntry.model.create({
              ...cleanItemData,
              tripId: newTripId,
              userId,
            });
            imported++;
          } catch (err) {
            errors.push({ type: itemType, error: err.message });
            skipped++;
          }
        }
      }
    }

    return apiResponse.success(res, { imported, skipped, errors }, 'Import complete');
  } catch (error) {
    logger.error('EXECUTE_IMPORT_ERROR', { userId: req.user?.id, error: error.message });
    return apiResponse.internalError(res, 'Error executing import', error);
  }
};

/**
 * GET /users/search
 * Search users by email (requires authentication)
 */
exports.searchUsersByEmail = async (req, res) => {
  try {
    const searchTerm = req.query.q || req.query.email;

    const users = await userService.searchUsersByIdentifier(searchTerm, { limit: 10, includePhantom: true });

    return apiResponse.success(res, { users }, 'Search completed successfully');
  } catch (error) {
    logger.error('SEARCH_USERS_ERROR', { query: req.query, error: error.message });

    if (error.statusCode === 400) {
      return apiResponse.badRequest(res, error.message);
    }

    return apiResponse.internalError(res, 'Error searching users', error);
  }
};
