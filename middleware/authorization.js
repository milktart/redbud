/**
 * Authorization Middleware
 *
 * Centralized middleware for trip and item ownership verification.
 * Eliminates duplicate authorization logic across route files.
 *
 * Usage in routes:
 *   const { checkTripAccess, checkItemOwnership } = require('../../../middleware/authorization');
 *
 *   router.get('/trips/:tripId/hotels', checkTripAccess('view'), hotelController.getTripHotels);
 *   router.put('/hotels/:id', checkItemOwnership('Hotel', 'hotel'), hotelController.updateHotel);
 *
 * Benefits:
 * - Consistent authorization across all routes
 * - Attaches trip/item to req object for reuse in controllers
 * - Single point of maintenance for access control logic
 * - Reduces code duplication (~15 instances across routes)
 */

const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Check if the authenticated user has access to a trip
 *
 * Verifies that the trip exists and belongs to the current user.
 * Attaches the trip to req.trip for reuse in subsequent middleware/controllers.
 *
 * @param {string} permission - Permission level required ('view', 'edit', 'delete')
 *                              Currently all require ownership. Future: companion permissions.
 * @returns {Function} Express middleware function
 *
 * @example
 * router.get('/trips/:tripId/hotels', checkTripAccess('view'), hotelController.getTripHotels);
 */
function checkTripAccess(permission = 'view') {
  return async (req, res, next) => {
    try {
      const { tripId } = req.params;
      const { Trip } = require('../models');

      if (!tripId) {
        return apiResponse.badRequest(res, 'Trip ID is required');
      }

      const trip = await Trip.findOne({
        where: { id: tripId, userId: req.user.id },
      });

      if (!trip) {
        return apiResponse.forbidden(res, 'Access denied to this trip');
      }

      // Attach trip to request for reuse in controllers
      req.trip = trip;
      next();
    } catch (error) {
      logger.error('TRIP_ACCESS_CHECK_ERROR', { tripId: req.params.tripId, error: error.message });
      return apiResponse.internalError(res, 'Failed to verify trip access', error);
    }
  };
}

/**
 * Check if the authenticated user owns a specific travel item
 *
 * Verifies that the item exists and belongs to the current user.
 * Attaches the item to req.item for reuse in subsequent middleware/controllers.
 *
 * @param {string} modelName - Name of the model (e.g., 'Hotel', 'Flight', 'Event')
 * @param {string} itemType - Readable item type for error messages (e.g., 'hotel', 'flight')
 * @returns {Function} Express middleware function
 *
 * @example
 * router.put('/hotels/:id', checkItemOwnership('Hotel', 'hotel'), hotelController.updateHotel);
 * router.delete('/flights/:id', checkItemOwnership('Flight', 'flight'), flightController.deleteFlight);
 */
function checkItemOwnership(modelName, itemType) {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const models = require('../models');
      const Model = models[modelName];

      if (!Model) {
        logger.error('INVALID_MODEL_NAME', { modelName });
        return apiResponse.internalError(res, 'Invalid item type');
      }

      if (!id) {
        return apiResponse.badRequest(res, `${itemType} ID is required`);
      }

      const item = await Model.findByPk(id);

      if (!item) {
        return apiResponse.notFound(res, `${itemType} not found`);
      }

      if (item.userId !== req.user.id) {
        return apiResponse.forbidden(res, `Access denied to this ${itemType}`);
      }

      // Attach item to request for reuse in controllers
      req.item = item;
      next();
    } catch (error) {
      logger.error('ITEM_OWNERSHIP_CHECK_ERROR', {
        itemType,
        itemId: req.params.id,
        error: error.message,
      });
      return apiResponse.internalError(res, `Failed to verify ${itemType} access`, error);
    }
  };
}

// checkItemTripAccess removed - no longer needed with unified item API

module.exports = {
  checkTripAccess,
  checkItemOwnership,
};
