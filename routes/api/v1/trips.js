/**
 * API v1 Trips Routes
 * RESTful JSON API for trip management
 *
 * Phase 4 Refactoring: Thin routes using controller pattern
 * - Business logic delegated to TripController
 * - Uses TripBusinessService and TripPresentationService
 * - No direct service access in routes
 *
 * All endpoints require authentication (ensureAuthenticated middleware)
 * Response format: { success: boolean, data: ?, message: string }
 */

const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const tripController = require('../../../controllers/tripController');

const router = express.Router();

// All trip routes require authentication
router.use(ensureAuthenticated);

/**
 * GET /api/v1/trips
 * List all trips for authenticated user (both owned and companion trips)
 *
 * Returns a deduplicated list of trips where user is owner or companion
 * Optionally filters by trip dates and supports pagination
 */
router.get('/', tripController.getUserTrips);

/**
 * GET /api/v1/trips/:id
 * Get trip details by ID with all associated items and companions
 *
 * Returns complete trip information including all nested travel items and companion details
 */
router.get('/:id', tripController.getTrip);

/**
 * POST /api/v1/trips
 * Create a new trip
 *
 * Creates a new trip with initial metadata
 * Sets authenticated user as trip owner
 */
router.post('/', tripController.createTrip);

/**
 * PUT /api/v1/trips/:id
 * Update an existing trip
 *
 * Allows updating trip metadata and scheduling information
 * Validates trip ownership
 */
router.put('/:id', tripController.updateTrip);

/**
 * DELETE /api/v1/trips/:id
 * Delete a trip
 *
 * Soft delete cascading to all associated items and relationships
 * All flights, hotels, events, transportation, car rentals, and vouchers are deleted
 * Companion relationships are also removed
 */
router.delete('/:id', tripController.deleteTrip);

module.exports = router;
