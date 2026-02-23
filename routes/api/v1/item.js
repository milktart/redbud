/**
 * Unified Item Routes
 *
 * Single API for all travel item types (flight, hotel, transportation, event, car_rental).
 *
 * All routes require authentication via ensureAuthenticated middleware.
 */

const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const itemController = require('../../../controllers/itemController');
const { validateItemCreation, validateItemUpdate } = require('../../../middleware/validation');

const router = express.Router();

// All item routes require authentication
router.use(ensureAuthenticated);

/**
 * POST /api/v1/item
 * Create a travel item (flight, hotel, transportation, event, car_rental)
 *
 * Request body must include:
 * - itemType: string (flight|hotel|transportation|event|car_rental)
 * - ...item-specific fields
 *
 * Example:
 * {
 *   "itemType": "flight",
 *   "tripId": "uuid-here", // optional
 *   "flightNumber": "AA100",
 *   "departureDate": "2024-01-01",
 *   "departureTime": "10:00",
 *   "arrivalDate": "2024-01-01",
 *   "arrivalTime": "14:00",
 *   "origin": "JFK",
 *   "destination": "LAX"
 * }
 */
router.post('/', validateItemCreation, itemController.createItem);

/**
 * GET /api/v1/item
 * List items with optional filtering
 *
 * Query params:
 * - type: Filter by itemType (flight, hotel, transportation, event, car_rental)
 * - tripId: Filter by trip UUID
 *
 * Examples:
 * - GET /api/v1/item                        (all my items)
 * - GET /api/v1/item?type=flight            (all my flights)
 * - GET /api/v1/item?tripId=abc-123         (all items in trip)
 * - GET /api/v1/item?type=hotel&tripId=xyz  (hotels in specific trip)
 */
router.get('/', itemController.getItems);

/**
 * GET /api/v1/item/:id
 * Get a single item by ID (works for any item type)
 *
 * Returns the item with itemType field added for client identification.
 */
router.get('/:id', itemController.getItem);

/**
 * PUT /api/v1/item/:id
 * Update an item
 *
 * Request body must include:
 * - itemType: string (must match the item's actual type)
 * - ...fields to update
 *
 * Example:
 * {
 *   "itemType": "flight",
 *   "flightNumber": "AA200"
 * }
 */
router.put('/:id', validateItemUpdate, itemController.updateItem);

/**
 * DELETE /api/v1/item/:id
 * Delete an item (soft delete)
 *
 * Works for any item type. The item will be soft-deleted (paranoid: true).
 */
router.delete('/:id', itemController.deleteItem);

module.exports = router;
