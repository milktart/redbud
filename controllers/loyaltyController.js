const LoyaltyService = require('../services/LoyaltyService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const loyaltyService = new LoyaltyService();

exports.getMyPrograms = async (req, res) => {
  try {
    const programs = await loyaltyService.getMyPrograms(req.user.id);
    return apiResponse.success(res, programs, `Retrieved ${programs.length} loyalty programs`);
  } catch (error) {
    logger.error('GET_LOYALTY_PROGRAMS_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve loyalty programs', error);
  }
};

exports.addProgram = async (req, res) => {
  try {
    const { programName, memberNumber, category } = req.body;
    if (!programName || !memberNumber) {
      return apiResponse.badRequest(res, 'Program name and member number are required');
    }
    const program = await loyaltyService.addProgram(req.user.id, { programName, memberNumber, category });
    return apiResponse.created(res, program, 'Loyalty program added');
  } catch (error) {
    logger.error('ADD_LOYALTY_PROGRAM_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to add loyalty program', error);
  }
};

exports.updateProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const program = await loyaltyService.updateProgram(id, req.user.id, req.body);
    return apiResponse.success(res, program, 'Loyalty program updated');
  } catch (error) {
    logger.error('UPDATE_LOYALTY_PROGRAM_ERROR', { userId: req.user.id, id: req.params.id, error: error.message });
    if (error.message.includes('not found')) {
      return apiResponse.notFound(res, error.message);
    }
    return apiResponse.internalError(res, 'Failed to update loyalty program', error);
  }
};

exports.deleteProgram = async (req, res) => {
  try {
    const { id } = req.params;
    await loyaltyService.deleteProgram(id, req.user.id);
    return apiResponse.success(res, null, 'Loyalty program deleted');
  } catch (error) {
    logger.error('DELETE_LOYALTY_PROGRAM_ERROR', { userId: req.user.id, id: req.params.id, error: error.message });
    if (error.message.includes('not found')) {
      return apiResponse.notFound(res, error.message);
    }
    return apiResponse.internalError(res, 'Failed to delete loyalty program', error);
  }
};
