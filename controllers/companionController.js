/**
 * Companion Controller
 *
 * Handles companion relationship management.
 * Companions are bidirectional user-to-user relationships with global permissions.
 */

const CompanionService = require('../services/CompanionService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { PERMISSION_LEVELS } = require('../constants/permissionConstants');

const companionService = new CompanionService();

/**
 * POST /api/v1/companions
 * Add a companion by email
 */
exports.addCompanion = async (req, res) => {
  try {
    const { identifier, email, permissionLevel = PERMISSION_LEVELS.COMPANION.VIEW, firstName, lastName } = req.body;
    const userId = req.user.id;

    const lookupValue = identifier || email;
    if (!lookupValue) {
      return apiResponse.badRequest(res, 'Email or phone number is required');
    }

    const companion = await companionService.addCompanion(userId, lookupValue, permissionLevel, firstName, lastName);

    return apiResponse.created(res, companion, 'Companion added successfully');
  } catch (error) {
    logger.error('ADD_COMPANION_ERROR', {
      userId: req.user.id,
      email: req.body.email,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      return apiResponse.notFound(res, error.message);
    }

    if (error.message.includes('already exists')) {
      return apiResponse.conflict(res, error.message);
    }

    return apiResponse.internalError(res, 'Failed to add companion', error);
  }
};

/**
 * GET /api/v1/companions
 * Get all companions for the current user
 */
exports.getMyCompanions = async (req, res) => {
  try {
    const userId = req.user.id;
    const companions = await companionService.getMyCompanions(userId);

    return apiResponse.success(res, companions, `Retrieved ${companions.length} companions`);
  } catch (error) {
    logger.error('GET_MY_COMPANIONS_ERROR', {
      userId: req.user.id,
      error: error.message,
    });
    return apiResponse.internalError(res, 'Failed to retrieve companions', error);
  }
};

/**
 * GET /api/v1/companions/received
 * Get all companions who have added the current user
 */
exports.getCompanionsWhoAddedMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const companions = await companionService.getCompanionsWhoAddedMe(userId);

    return apiResponse.success(
      res,
      companions,
      `Retrieved ${companions.length} companions who added you`
    );
  } catch (error) {
    logger.error('GET_COMPANIONS_WHO_ADDED_ME_ERROR', {
      userId: req.user.id,
      error: error.message,
    });
    return apiResponse.internalError(res, 'Failed to retrieve companions', error);
  }
};

/**
 * PUT /api/v1/companions/:companionUserId
 * Update companion permission level
 */
exports.updatePermission = async (req, res) => {
  try {
    const { companionUserId } = req.params;
    const { permissionLevel } = req.body;
    const userId = req.user.id;

    if (!permissionLevel) {
      return apiResponse.badRequest(res, 'Permission level is required');
    }

    const companion = await companionService.updatePermission(
      userId,
      companionUserId,
      permissionLevel
    );

    return apiResponse.success(res, companion, 'Companion permission updated successfully');
  } catch (error) {
    logger.error('UPDATE_COMPANION_PERMISSION_ERROR', {
      userId: req.user.id,
      companionUserId: req.params.companionUserId,
      error: error.message,
    });

    if (error.message.includes('not found')) {
      return apiResponse.notFound(res, error.message);
    }

    return apiResponse.internalError(res, 'Failed to update companion permission', error);
  }
};

/**
 * DELETE /api/v1/companions/:companionUserId
 * Remove a companion
 */
exports.removeCompanion = async (req, res) => {
  try {
    const { companionUserId } = req.params;
    const userId = req.user.id;

    await companionService.removeCompanion(userId, companionUserId);

    return apiResponse.success(res, null, 'Companion removed successfully');
  } catch (error) {
    logger.error('REMOVE_COMPANION_ERROR', {
      userId: req.user.id,
      companionUserId: req.params.companionUserId,
      error: error.message,
    });
    return apiResponse.internalError(res, 'Failed to remove companion', error);
  }
};
