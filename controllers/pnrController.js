const PnrService = require('../services/PnrService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const pnrService = new PnrService();

exports.lookupPnr = async (req, res) => {
  const { pnr, airline } = req.body;

  if (!pnr || !/^[A-Z0-9]{5,7}$/i.test(pnr.trim())) {
    return apiResponse.badRequest(res, 'Invalid PNR format');
  }
  if (!airline) {
    return apiResponse.badRequest(res, 'airline is required');
  }

  try {
    const flights = await pnrService.lookup(req.user.id, pnr.trim(), airline);
    return apiResponse.success(res, { flights }, `Found ${flights.length} flight(s)`);
  } catch (error) {
    logger.error('PNR_LOOKUP_ERROR', {
      userId: req.user.id,
      pnr: pnr.trim(),
      error: error.message,
    });

    const code = error.statusCode;
    if (code === 400) return apiResponse.badRequest(res, error.message);
    if (code === 422) return res.status(422).json({ success: false, message: error.message });
    if (code === 502) return apiResponse.error(res, error.message, 502);
    return apiResponse.internalError(res, 'PNR lookup failed', error);
  }
};
