/**
 * Unified Item Controller
 *
 * Handles all travel item types (flight, hotel, transportation, event, car_rental)
 * through a single unified API endpoint.
 *
 * Endpoints:
 * - POST   /api/v1/item - Create any item type
 * - GET    /api/v1/item - List items with optional filtering
 * - GET    /api/v1/item/:id - Get a single item
 * - PUT    /api/v1/item/:id - Update an item
 * - DELETE /api/v1/item/:id - Delete an item
 */

const { Flight, Hotel, Transportation, Event, CarRental, Trip } = require('../models');
const TravelItemService = require('../services/TravelItemService');
const FlightService = require('../services/FlightService');
const HotelService = require('../services/HotelService');
const TransportationService = require('../services/TransportationService');
const EventService = require('../services/EventService');
const CarRentalService = require('../services/CarRentalService');
const ItemPresentationService = require('../services/presentation/ItemPresentationService');
const PermissionService = require('../services/PermissionService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Map itemType to Sequelize model
const MODEL_MAP = {
  flight: Flight,
  hotel: Hotel,
  transportation: Transportation,
  event: Event,
  car_rental: CarRental,
};

// Map itemType to Service class
const SERVICE_MAP = {
  flight: FlightService,
  hotel: HotelService,
  transportation: TransportationService,
  event: EventService,
  car_rental: CarRentalService,
};

const VALID_ITEM_TYPES = Object.keys(MODEL_MAP);

const presentationService = new ItemPresentationService();
const permissionService = new PermissionService();

/**
 * Get service instance for item type
 * @param {string} itemType - Item type (flight, hotel, etc.)
 * @returns {TravelItemService} Service instance
 */
function getService(itemType) {
  const ServiceClass = SERVICE_MAP[itemType];
  const Model = MODEL_MAP[itemType];
  return new ServiceClass(Model);
}

/**
 * POST /api/v1/item
 * Create a travel item of any type
 */
exports.createItem = async (req, res) => {
  try {
    const { itemType, ...itemData } = req.body;

    // Validate itemType
    if (!itemType || !MODEL_MAP[itemType]) {
      return apiResponse.badRequest(
        res,
        `Invalid itemType. Must be one of: ${VALID_ITEM_TYPES.join(', ')}`
      );
    }

    const userId = req.user.id;
    const service = getService(itemType);

    // If tripId provided, validate user has access to trip
    if (itemData.tripId) {
      const trip = await Trip.findByPk(itemData.tripId);
      if (!trip) {
        return apiResponse.forbidden(res, 'Access denied to this trip');
      }
      const canManage = await permissionService.canManageTripAsync(trip, userId);
      if (!canManage) {
        return apiResponse.forbidden(res, 'Access denied to this trip');
      }
    }

    // Prepare item data (geocoding, datetime parsing, etc.)
    let preparedData;
    switch (itemType) {
      case 'flight':
        preparedData = await service.prepareFlightData(itemData);
        break;
      case 'hotel':
        preparedData = await service.prepareHotelData(itemData);
        break;
      case 'transportation':
        preparedData = await service.prepareTransportationData(itemData);
        break;
      case 'event':
        preparedData = await service.prepareEventData(itemData);
        break;
      case 'car_rental':
        preparedData = await service.prepareCarRentalData(itemData);
        break;
      default:
        return apiResponse.badRequest(res, `Unsupported itemType: ${itemType}`);
    }

    // Create item
    const item = await service.createItem(preparedData, userId);

    // Creator always has full permissions
    const enriched = presentationService.enrichItemWithFlags(item, userId, {
      canView: true, canEdit: true, canDelete: true,
    });

    return apiResponse.created(res, { ...enriched, itemType }, `${itemType} created successfully`);
  } catch (error) {
    logger.error('CREATE_ITEM_ERROR', { itemType: req.body.itemType, error: error.message });
    return apiResponse.internalError(res, 'Failed to create item', error);
  }
};

/**
 * GET /api/v1/item
 * List items with optional filtering
 * Query params:
 *   - type: filter by itemType (flight, hotel, etc.)
 *   - tripId: filter by trip
 */
exports.getItems = async (req, res) => {
  try {
    const { type, tripId } = req.query;
    const userId = req.user.id;

    // Validate type if provided
    if (type && !MODEL_MAP[type]) {
      return apiResponse.badRequest(
        res,
        `Invalid type. Must be one of: ${VALID_ITEM_TYPES.join(', ')}`
      );
    }

    // Build where clause and determine item-level permission flags
    let where;
    let itemPermissionFlags = { canView: true, canEdit: true, canDelete: true };

    if (tripId) {
      // Verify trip access before listing items by tripId
      const trip = await Trip.findByPk(tripId);
      if (!trip) {
        return apiResponse.notFound(res, 'Trip not found');
      }
      const canView = await permissionService.canViewTripAsync(trip, userId);
      if (!canView) {
        return apiResponse.forbidden(res, 'Access denied to this trip');
      }
      const canManage = await permissionService.canManageTripAsync(trip, userId);
      where = { tripId };
      // Items in the trip: everyone with access can view, manage-level can edit
      itemPermissionFlags = { canView: true, canEdit: canManage, canDelete: trip.userId === userId };
    } else {
      where = { userId };
    }

    let items = [];
    const typesToQuery = type ? [type] : VALID_ITEM_TYPES;

    // Query each item type
    for (const itemType of typesToQuery) {
      const Model = MODEL_MAP[itemType];
      const typeItems = await Model.findAll({
        where,
        order: [['createdAt', 'DESC']],
        paranoid: true, // Only return non-deleted items
      });

      // Add itemType to each item for client identification
      const itemsWithType = typeItems.map((item) => ({
        ...item.toJSON(),
        itemType,
      }));

      items = items.concat(itemsWithType);
    }

    // Sort all items by createdAt DESC
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Enrich all items with pre-computed permission flags
    const enriched = items.map((item) =>
      presentationService.enrichItemWithFlags(item, userId, itemPermissionFlags)
    );

    return apiResponse.success(res, enriched, `Retrieved ${items.length} items`);
  } catch (error) {
    logger.error('GET_ITEMS_ERROR', { query: req.query, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve items', error);
  }
};

/**
 * GET /api/v1/item/:id
 * Get a single item by ID
 */
exports.getItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Try to find item in each table
    let item = null;
    let itemType = null;

    for (const [type, Model] of Object.entries(MODEL_MAP)) {
      item = await Model.findByPk(id, {
        include: [{ model: Trip, as: 'trip', required: false }],
      });
      if (item) {
        itemType = type;
        break;
      }
    }

    if (!item) {
      return apiResponse.notFound(res, 'Item not found');
    }

    // Check view permission
    const itemObj = { ...item.toJSON(), itemType };
    const canView = await permissionService.canViewItemAsync(itemObj, userId);
    if (!canView) {
      return apiResponse.forbidden(res, 'Access denied');
    }

    // Determine edit/delete flags for response
    const canManage = await permissionService.canManageItemAsync(itemObj, userId);
    const isOwner = item.userId === userId || item.createdBy === userId;

    // Enrich item with resolved permission flags
    const enriched = presentationService.enrichItemWithFlags(itemObj, userId, {
      canView: true,
      canEdit: canManage,
      canDelete: isOwner,
    });

    return apiResponse.success(res, enriched, 'Item retrieved successfully');
  } catch (error) {
    logger.error('GET_ITEM_ERROR', { itemId: req.params.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve item', error);
  }
};

/**
 * PUT /api/v1/item/:id
 * Update an item
 */
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemType, ...updateData } = req.body;
    const userId = req.user.id;

    // Validate itemType
    if (!itemType || !MODEL_MAP[itemType]) {
      return apiResponse.badRequest(
        res,
        `Invalid itemType. Must be one of: ${VALID_ITEM_TYPES.join(', ')}`
      );
    }

    // Find item
    const Model = MODEL_MAP[itemType];
    const item = await Model.findByPk(id);

    if (!item) {
      return apiResponse.notFound(res, 'Item not found');
    }

    // Check manage permission
    const canManage = await permissionService.canManageItemAsync({ ...item.toJSON(), itemType }, userId);
    if (!canManage) {
      return apiResponse.forbidden(res, 'Access denied');
    }

    // Prepare update data
    const service = getService(itemType);
    let preparedData;
    switch (itemType) {
      case 'flight':
        preparedData = await service.prepareFlightData(updateData);
        break;
      case 'hotel':
        preparedData = await service.prepareHotelData(updateData);
        break;
      case 'transportation':
        preparedData = await service.prepareTransportationData(updateData);
        break;
      case 'event':
        preparedData = await service.prepareEventData(updateData);
        break;
      case 'car_rental':
        preparedData = await service.prepareCarRentalData(updateData);
        break;
      default:
        return apiResponse.badRequest(res, `Unsupported itemType: ${itemType}`);
    }

    // Update item
    const updated = await service.updateItem(item, preparedData, userId);

    // Enrich with flags — user just proved they can manage, only owner can delete
    const isOwner = item.userId === userId || item.createdBy === userId;
    const enriched = presentationService.enrichItemWithFlags(updated, userId, {
      canView: true,
      canEdit: true,
      canDelete: isOwner,
    });

    return apiResponse.success(
      res,
      { ...enriched, itemType },
      `${itemType} updated successfully`
    );
  } catch (error) {
    logger.error('UPDATE_ITEM_ERROR', { itemId: req.params.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to update item', error);
  }
};

/**
 * DELETE /api/v1/item/:id
 * Delete an item (soft delete)
 */
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Try to find item in each table
    let item = null;
    let itemType = null;
    let Model = null;

    for (const [type, model] of Object.entries(MODEL_MAP)) {
      item = await model.findByPk(id);
      if (item) {
        itemType = type;
        Model = model;
        break;
      }
    }

    if (!item) {
      return apiResponse.notFound(res, 'Item not found');
    }

    // Check ownership
    if (item.userId !== userId) {
      return apiResponse.forbidden(res, 'Access denied');
    }

    // Delete item
    const service = getService(itemType);
    await service.deleteItem(item, userId);

    return apiResponse.success(res, null, `${itemType} deleted successfully`);
  } catch (error) {
    logger.error('DELETE_ITEM_ERROR', { itemId: req.params.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to delete item', error);
  }
};

module.exports = exports;
