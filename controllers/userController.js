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
    const { Trip, Flight, Hotel, Transportation, CarRental, Event, Companion, Attendee, User, Voucher } = require('../models');
    const userId = req.user.id;
    const { Op } = require('sequelize');

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
          include: [{ model: User, as: 'user', attributes: ['email', 'firstName', 'lastName'] }],
        },
      ],
      order: [['departureDate', 'ASC']],
    });

    // Collect all trip-item IDs and standalone item IDs for attendee lookup
    const allItemIds = { flight: [], hotel: [], transportation: [], car_rental: [], event: [] };
    for (const trip of trips) {
      for (const f of trip.flights ?? []) allItemIds.flight.push(f.id);
      for (const h of trip.hotels ?? []) allItemIds.hotel.push(h.id);
      for (const t of trip.transportation ?? []) allItemIds.transportation.push(t.id);
      for (const c of trip.carRentals ?? []) allItemIds.car_rental.push(c.id);
      for (const e of trip.events ?? []) allItemIds.event.push(e.id);
    }

    // Fetch standalone items (not linked to any trip)
    const [standaloneFlights, standaloneHotels, standaloneTransportation, standaloneCarRentals, standaloneEvents] =
      await Promise.all([
        Flight.findAll({ where: { userId, tripId: null }, order: [['departureDateTime', 'ASC']] }),
        Hotel.findAll({ where: { userId, tripId: null }, order: [['checkInDateTime', 'ASC']] }),
        Transportation.findAll({ where: { userId, tripId: null }, order: [['departureDateTime', 'ASC']] }),
        CarRental.findAll({ where: { userId, tripId: null }, order: [['pickupDateTime', 'ASC']] }),
        Event.findAll({ where: { userId, tripId: null }, order: [['startDateTime', 'ASC']] }),
      ]);

    for (const f of standaloneFlights) allItemIds.flight.push(f.id);
    for (const h of standaloneHotels) allItemIds.hotel.push(h.id);
    for (const t of standaloneTransportation) allItemIds.transportation.push(t.id);
    for (const c of standaloneCarRentals) allItemIds.car_rental.push(c.id);
    for (const e of standaloneEvents) allItemIds.event.push(e.id);

    // Fetch attendees for all items in one query
    const allIds = Object.values(allItemIds).flat();
    const itemAttendees = allIds.length > 0
      ? await Attendee.findAll({
          where: {
            itemType: { [Op.in]: ['flight', 'hotel', 'transportation', 'car_rental', 'event'] },
            itemId: { [Op.in]: allIds },
          },
          include: [{ model: User, as: 'user', attributes: ['email', 'firstName', 'lastName'] }],
        })
      : [];

    // Group item attendees by itemId
    const attendeesByItemId = {};
    for (const a of itemAttendees) {
      if (!attendeesByItemId[a.itemId]) attendeesByItemId[a.itemId] = [];
      attendeesByItemId[a.itemId].push({
        email: a.user?.email,
        firstName: a.user?.firstName,
        lastName: a.user?.lastName,
        permissionLevel: a.permissionLevel,
      });
    }

    const stripItem = (item) => {
      const { id, userId: _u, createdBy: _c, tripId: _t, createdAt, updatedAt, ...rest } = item;
      return { ...rest, _sourceId: id, attendees: attendeesByItemId[id] ?? [] };
    };

    const tripsData = trips.map((trip) => {
      const t = trip.toJSON();
      const tripAttendees = (t.attendees ?? []).map((a) => ({
        email: a.user?.email,
        firstName: a.user?.firstName,
        lastName: a.user?.lastName,
        permissionLevel: a.permissionLevel,
      }));
      return {
        _sourceId: t.id,
        name: t.name,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        purpose: t.purpose,
        isConfirmed: t.isConfirmed,
        attendees: tripAttendees,
        flights: (t.flights ?? []).map(stripItem),
        hotels: (t.hotels ?? []).map(stripItem),
        transportation: (t.transportation ?? []).map(stripItem),
        carRentals: (t.carRentals ?? []).map(stripItem),
        events: (t.events ?? []).map(stripItem),
      };
    });

    const standaloneData = {
      flights: standaloneFlights.map((i) => stripItem(i.toJSON())),
      hotels: standaloneHotels.map((i) => stripItem(i.toJSON())),
      transportation: standaloneTransportation.map((i) => stripItem(i.toJSON())),
      carRentals: standaloneCarRentals.map((i) => stripItem(i.toJSON())),
      events: standaloneEvents.map((i) => stripItem(i.toJSON())),
    };

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

    // Export vouchers (strip parentVoucherId — the referenced ID won't exist in a restored account)
    const vouchers = await Voucher.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
    const vouchersData = vouchers.map((v) => {
      const { id, userId: _u, parentVoucherId: _p, createdAt, updatedAt, ...rest } = v.toJSON();
      return { ...rest, _sourceId: id };
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      companions: companionsData,
      trips: tripsData,
      standalone: standaloneData,
      vouchers: vouchersData,
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
    const { Trip, Flight, Hotel, Transportation, CarRental, Event, Voucher } = require('../models');
    const { Op } = require('sequelize');
    const userId = req.user.id;
    const { trips: importedTrips, standalone: importedStandalone, vouchers: importedVouchers } = req.body;

    if (!Array.isArray(importedTrips)) {
      return apiResponse.badRequest(res, 'Request body must contain a "trips" array');
    }

    // Load all existing data for the current user
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

    // Flatten all existing items per type for duplicate checking (trips + standalone)
    const [existingStandaloneFlights, existingStandaloneHotels, existingStandaloneTransportation, existingStandaloneCarRentals, existingStandaloneEvents] =
      await Promise.all([
        Flight.findAll({ where: { userId, tripId: null } }),
        Hotel.findAll({ where: { userId, tripId: null } }),
        Transportation.findAll({ where: { userId, tripId: null } }),
        CarRental.findAll({ where: { userId, tripId: null } }),
        Event.findAll({ where: { userId, tripId: null } }),
      ]);

    const allExistingFlights = [...existingTrips.flatMap((t) => t.flights ?? []), ...existingStandaloneFlights];
    const allExistingHotels = [...existingTrips.flatMap((t) => t.hotels ?? []), ...existingStandaloneHotels];
    const allExistingTransportation = [...existingTrips.flatMap((t) => t.transportation ?? []), ...existingStandaloneTransportation];
    const allExistingCarRentals = [...existingTrips.flatMap((t) => t.carRentals ?? []), ...existingStandaloneCarRentals];
    const allExistingEvents = [...existingTrips.flatMap((t) => t.events ?? []), ...existingStandaloneEvents];

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

    const annotatedTrips = importedTrips.map((trip, tripIndex) => {
      const tripDup = duplicateDetectionService.checkTripDuplicates(trip, existingTrips);
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

    // Annotate standalone items with duplicate detection
    const annotatedStandalone = importedStandalone
      ? {
          flights: annotateItems(importedStandalone.flights, duplicateDetectionService.checkFlightDuplicates, allExistingFlights),
          hotels: annotateItems(importedStandalone.hotels, duplicateDetectionService.checkHotelDuplicates, allExistingHotels),
          transportation: annotateItems(importedStandalone.transportation, duplicateDetectionService.checkTransportationDuplicates, allExistingTransportation),
          carRentals: annotateItems(importedStandalone.carRentals, duplicateDetectionService.checkCarRentalDuplicates, allExistingCarRentals),
          events: annotateItems(importedStandalone.events, duplicateDetectionService.checkEventDuplicates, allExistingEvents),
        }
      : null;

    // Annotate vouchers with duplicate detection
    let annotatedVouchers = null;
    if (Array.isArray(importedVouchers) && importedVouchers.length > 0) {
      const existingVoucherNumbers = new Set(
        (await Voucher.findAll({ where: { userId }, attributes: ['voucherNumber'] }))
          .map((v) => v.voucherNumber)
      );
      annotatedVouchers = importedVouchers.map((v, i) => ({
        ...v,
        _importIndex: i,
        isDuplicate: existingVoucherNumbers.has(v.voucherNumber),
        duplicateOf: existingVoucherNumbers.has(v.voucherNumber) ? { voucherNumber: v.voucherNumber } : null,
      }));
    }

    return apiResponse.success(res, { trips: annotatedTrips, standalone: annotatedStandalone, vouchers: annotatedVouchers }, 'Preview generated');
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
    const { Trip, Flight, Hotel, Transportation, CarRental, Event, Companion, Attendee, User, Voucher } = require('../models');
    const userId = req.user.id;
    const { trips: importTrips, companions: importCompanions, standalone: importStandalone, vouchers: importVouchers } = req.body;

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

    const CompanionService = require('../services/CompanionService');
    const companionService = new CompanionService();

    // Helper: find or create a user by email (creates phantom if not found), then add as attendee
    const importAttendees = async (attendees, itemType, itemId, addedBy) => {
      if (!Array.isArray(attendees)) return;
      for (const a of attendees) {
        if (!a.email) continue;
        try {
          let targetUser = await User.findOne({ where: { email: a.email.toLowerCase() } });
          if (!targetUser) {
            // Create phantom user so the attendee link is preserved;
            // they can claim the account when they register with this email.
            if (!a.firstName || !a.lastName) continue; // can't create phantom without a name
            const crypto = require('crypto');
            targetUser = await User.create({
              email: a.email.toLowerCase(),
              password: crypto.randomBytes(32).toString('hex'),
              firstName: a.firstName.trim(),
              lastName: a.lastName.trim().charAt(0),
              isPhantom: true,
            });
          }
          await Attendee.findOrCreate({
            where: { userId: targetUser.id, itemType, itemId },
            defaults: { permissionLevel: a.permissionLevel ?? 'view', addedBy },
          });
        } catch (err) {
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

    // Import standalone items (no tripId)
    if (importStandalone && typeof importStandalone === 'object') {
      for (const [itemType, itemEntries] of Object.entries(importStandalone)) {
        const model = ITEM_MODELS[itemType];
        if (!model || !Array.isArray(itemEntries)) continue;

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
              tripId: null,
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

    // Import vouchers — skip on voucherNumber conflict (already exists)
    if (Array.isArray(importVouchers)) {
      for (const voucherEntry of importVouchers) {
        const { data: voucherData, selected: voucherSelected } = voucherEntry;
        if (!voucherSelected) { skipped++; continue; }

        try {
          const { _sourceId, createdAt, updatedAt, ...cleanVoucherData } = voucherData;
          await Voucher.create({ ...cleanVoucherData, userId });
          imported++;
        } catch (err) {
          if (err.name === 'SequelizeUniqueConstraintError') {
            skipped++;
          } else {
            errors.push({ type: 'voucher', voucherNumber: voucherData.voucherNumber, error: err.message });
            skipped++;
          }
        }
      }
    }

    // Import companions — addCompanion handles phantom user creation automatically
    if (Array.isArray(importCompanions)) {
      for (const c of importCompanions) {
        if (!c.email) continue;
        try {
          await companionService.addCompanion(
            userId,
            c.email,
            c.permissionLevel ?? 'view',
            c.firstName,
            c.lastName
          );
          imported++;
        } catch (err) {
          if (!err.message?.includes('already exists')) {
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
