const FlightLookupService = require('../services/FlightLookupService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const service = new FlightLookupService();

// GET /api/v1/flight-lookup?flightNumber=DL622&date=2026-04-22
exports.lookup = async (req, res) => {
  const { flightNumber, date } = req.query;
  if (!flightNumber || !/^[A-Z]{2}\d{1,4}$/i.test(flightNumber.trim())) {
    return apiResponse.badRequest(res, 'flightNumber must be airline code + 1-4 digits (e.g. DL622)');
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return apiResponse.badRequest(res, 'date must be YYYY-MM-DD');
  }
  try {
    const result = await service.lookup(flightNumber.trim().toUpperCase(), date);
    return apiResponse.success(res, result, 'Flight details found');
  } catch (error) {
    logger.warn('FLIGHT_LOOKUP_ERROR', { flightNumber, date, error: error.message });
    const code = error.statusCode;
    if (code === 404) return res.status(404).json({ success: false, message: error.message });
    if (code === 500) return apiResponse.internalError(res, error.message);
    return apiResponse.internalError(res, 'Flight lookup failed', error);
  }
};

// POST /api/v1/flight-lookup/refresh  { flightNumber, date }
exports.refresh = async (req, res) => {
  const { flightNumber, date } = req.body;
  if (!flightNumber || !/^[A-Z]{2}\d{1,4}$/i.test(flightNumber.trim())) {
    return apiResponse.badRequest(res, 'flightNumber must be airline code + 1-4 digits');
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return apiResponse.badRequest(res, 'date must be YYYY-MM-DD');
  }
  try {
    const result = await service.refresh(flightNumber.trim().toUpperCase(), date);
    return apiResponse.success(res, result, 'Flight data refreshed and propagated');
  } catch (error) {
    logger.warn('FLIGHT_REFRESH_ERROR', { flightNumber, date, error: error.message });
    const code = error.statusCode;
    if (code === 404) return res.status(404).json({ success: false, message: error.message });
    return apiResponse.internalError(res, 'Flight refresh failed', error);
  }
};
