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
    const { Trip, Flight, Hotel, Transportation, CarRental, Event, Companion, Attendee, User } = require('../models');
    const userId = req.user.id;

    const trips = await Trip.findAll({
      where: { userId },
      include: [
        { model: Flight, as: 'flights', required: false },
        { model: Hotel, as: 'hotels', required: false },
        { model: Transportation, as: 'transportation', required: false },
        { model: CarRental, as: 'carRentals', required: false },
        { model: Event, as: 'events', required: false },
        {
          model: Attendee,
          as: 'attendees',
          required: false,
          include: [{ model: User, as: 'user', attributes: ['email'] }],
        },
      ],
      order: [['departureDate', 'ASC']],
    });

    // Helper to get item attendees keyed by itemId
    const allItemIds = { flight: [], hotel: [], transportation: [], car_rental: [], event: [] };
    for (const trip of trips) {
      for (const f of trip.flights ?? []) allItemIds.flight.push(f.id);
      for (const h of trip.hotels ?? []) allItemIds.hotel.push(h.id);
      for (const t of trip.transportation ?? []) allItemIds.transportation.push(t.id);
      for (const c of trip.carRentals ?? []) allItemIds.car_rental.push(c.id);
      for (const e of trip.events ?? []) allItemIds.event.push(e.id);
    }

    const { Op } = require('sequelize');
    const itemAttendees = await Attendee.findAll({
      where: {
        itemType: { [Op.in]: ['flight', 'hotel', 'transportation', 'car_rental', 'event'] },
        itemId: { [Op.in]: Object.values(allItemIds).flat() },
      },
      include: [{ model: User, as: 'user', attributes: ['email'] }],
    });

    // Group item attendees by itemId
    const attendeesByItemId = {};
    for (const a of itemAttendees) {
      if (!attendeesByItemId[a.itemId]) attendeesByItemId[a.itemId] = [];
      attendeesByItemId[a.itemId].push({ email: a.user?.email, permissionLevel: a.permissionLevel });
    }

    const stripItem = (item) => {
      const { id, userId: _u, createdBy: _c, tripId: _t, createdAt, updatedAt, ...rest } = item;
      return { ...rest, _sourceId: id, attendees: attendeesByItemId[id] ?? [] };
    };

    const tripsData = trips.map((trip) => {
      const t = trip.toJSON();
      const tripAttendees = (t.attendees ?? []).map((a) => ({
        email: a.user?.email,
        permissionLevel: a.permissionLevel,
      }));
      return {
        _sourceId: t.id,
        name: t.name,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        purpose: t.purpose,
        status: t.status,
        attendees: tripAttendees,
        flights: (t.flights ?? []).map(stripItem),
        hotels: (t.hotels ?? []).map(stripItem),
        transportation: (t.transportation ?? []).map(stripItem),
        carRentals: (t.carRentals ?? []).map(stripItem),
        events: (t.events ?? []).map(stripItem),
      };
    });

    // Export companions (by email so they can be re-linked in a different env)
    const companions = await Companion.findAll({
      where: { userId, permissionLevel: { [Op.ne]: 'none' } },
      include: [{ model: User, as: 'companionUser', attributes: ['email', 'firstName', 'lastName'] }],
    });
    const companionsData = companions.map((c) => ({
      email: c.companionUser?.email,
      firstName: c.companionUser?.firstName,
      lastName: c.companionUser?.lastName,
      permissionLevel: c.permissionLevel,
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      companions: companionsData,
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
    const { Trip, Flight, Hotel, Transportation, CarRental, Event, Companion, Attendee, User } = require('../models');
    const userId = req.user.id;
    const { trips: importTrips, companions: importCompanions } = req.body;

    if (!Array.isArray(importTrips)) {
      return apiResponse.badRequest(res, 'Request body must contain a "trips" array');
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const ITEM_MODELS = {
      flights: Flight,
      hotels: Hotel,
      transportation: Transportation,
      carRentals: CarRental,
      events: Event,
    };

    // Map itemType key → Attendee itemType enum value
    const ITEM_TYPE_ENUM = {
      flights: 'flight',
      hotels: 'hotel',
      transportation: 'transportation',
      carRentals: 'car_rental',
      events: 'event',
    };

    // Helper: add attendees to a newly created item by email lookup
    const importAttendees = async (attendees, itemType, itemId, tripOwnerId) => {
      if (!Array.isArray(attendees)) return;
      for (const a of attendees) {
        if (!a.email) continue;
        try {
          const targetUser = await User.findOne({ where: { email: a.email.toLowerCase() } });
          if (!targetUser) continue; // user doesn't exist in this env — skip silently
          await Attendee.findOrCreate({
            where: { userId: targetUser.id, itemType, itemId },
            defaults: { permissionLevel: a.permissionLevel ?? 'view' },
          });
        } catch (err) {
          // Non-fatal — log but continue
          logger.warn('IMPORT_ATTENDEE_SKIP', { email: a.email, itemType, error: err.message });
        }
      }
    };

    for (const tripEntry of importTrips) {
      const { tripData, selected: tripSelected, items: itemsMap = {} } = tripEntry;

      let newTripId = null;

      if (tripSelected) {
        try {
          const {
            id, _sourceId, userId: _uid, createdBy: _cby, createdAt, updatedAt,
            attendees: tripAttendees, ...cleanTripData
          } = tripData;
          const newTrip = await Trip.create({ ...cleanTripData, userId, createdBy: userId });
          newTripId = newTrip.id;
          imported++;
          await importAttendees(tripAttendees, 'trip', newTripId, userId);
        } catch (err) {
          errors.push({ type: 'trip', name: tripData.name, error: err.message });
          skipped++;
          continue;
        }
      } else {
        skipped++;
        newTripId = null;
      }

      // Import items
      for (const [itemType, itemEntries] of Object.entries(itemsMap)) {
        const model = ITEM_MODELS[itemType];
        if (!model) continue;

        for (const itemEntry of itemEntries) {
          const { data: itemData, selected: itemSelected } = itemEntry;
          if (!itemSelected) { skipped++; continue; }

          try {
            const {
              id, _sourceId, userId: _uid, createdBy: _cby,
              tripId: _tid, createdAt, updatedAt,
              attendees: itemAttendees, ...cleanItemData
            } = itemData;
            const newItem = await model.create({
              ...cleanItemData,
              tripId: newTripId,
              userId,
              createdBy: userId,
            });
            imported++;
            await importAttendees(itemAttendees, ITEM_TYPE_ENUM[itemType], newItem.id, userId);
          } catch (err) {
            errors.push({ type: itemType, error: err.message });
            skipped++;
          }
        }
      }
    }

    // Import companions by email lookup
    if (Array.isArray(importCompanions)) {
      const CompanionService = require('../services/CompanionService');
      const companionService = new CompanionService();
      for (const c of importCompanions) {
        if (!c.email) continue;
        try {
          const targetUser = await User.findOne({ where: { email: c.email.toLowerCase() } });
          if (!targetUser) continue; // user not in this env — skip
          // Use the service so the reciprocal record is created correctly
          await companionService.addCompanion(userId, targetUser.id, c.permissionLevel ?? 'view');
          imported++;
        } catch (err) {
          // Duplicate companion is fine — ignore unique constraint errors
          if (!err.message?.includes('already exists') && !err.name?.includes('SequelizeUniqueConstraintError')) {
            errors.push({ type: 'companion', email: c.email, error: err.message });
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
