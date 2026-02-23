/**
 * Attendee Routes
 * Endpoints for managing attendees on trips and travel items
 */

const express = require('express');
const attendeeController = require('../../../controllers/attendeeController');
const { ensureAuthenticated } = require('../../../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(ensureAuthenticated);

// POST /api/v1/attendees - Add an attendee
router.post('/', attendeeController.addAttendee);

// GET /api/v1/attendees - Get attendees for a trip/item
router.get('/', attendeeController.getAttendees);

// PUT /api/v1/attendees/:attendeeId - Update attendee permission
router.put('/:attendeeId', attendeeController.updateAttendeePermission);

// DELETE /api/v1/attendees/:attendeeId - Remove attendee
router.delete('/:attendeeId', attendeeController.removeAttendee);

module.exports = router;
