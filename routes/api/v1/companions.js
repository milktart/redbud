/**
 * Companion Routes
 * Endpoints for managing user-to-user companion relationships
 */

const express = require('express');
const companionController = require('../../../controllers/companionController');
const { ensureAuthenticated } = require('../../../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(ensureAuthenticated);

// POST /api/v1/companions - Add a companion
router.post('/', companionController.addCompanion);

// GET /api/v1/companions - Get my companions
router.get('/', companionController.getMyCompanions);

// PUT /api/v1/companions/:companionUserId - Update companion permission
router.put('/:companionUserId', companionController.updatePermission);

// DELETE /api/v1/companions/:companionUserId - Remove companion
router.delete('/:companionUserId', companionController.removeCompanion);

module.exports = router;
