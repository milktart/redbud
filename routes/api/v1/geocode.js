/**
 * Geocoding API v1 Routes
 * Provides geocoding and timezone inference endpoints
 */

const express = require('express');
const logger = require('../../../utils/logger');
const { geocodeLocation, inferTimezone } = require('../../../services/geocodingService');

const router = express.Router();

/**
 * GET /api/v1/geocode
 * Geocode an address and infer timezone
 *
 * Converts an address string to geographic coordinates and determines timezone
 * Used for location-based features in travel items
 *
 * @query {string} address - Address to geocode (required)
 *   - Can be partial (e.g., "Paris", "NYC", "Times Square")
 *   - More specific addresses yield more accurate results
 *
 * @returns {Object} 200 OK response with coordinates and timezone
 * @returns {boolean} returns.success - Always true on successful geocoding
 * @returns {string} returns.address - The address that was geocoded
 * @returns {number} returns.lat - Latitude coordinate
 * @returns {number} returns.lng - Longitude coordinate
 * @returns {string} returns.timezone - IANA timezone string (e.g., "Europe/Paris")
 *   - Falls back to 'UTC' if timezone inference fails
 *   - Always returns a valid timezone string
 *
 * @throws {400} Bad request - Address parameter missing or empty
 * @throws {404} Not found - Could not geocode the address
 * @throws {500} Server error - Geocoding service error
 *
 * @note No authentication required for geocoding service
 * @note Timezone inference always succeeds or returns 'UTC' as fallback
 *
 * @example
 * GET /api/v1/geocode?address=Eiffel%20Tower
 * Response: {
 *   "success": true,
 *   "address": "Eiffel Tower",
 *   "lat": 48.8584,
 *   "lng": 2.2945,
 *   "timezone": "Europe/Paris"
 * }
 */
router.get('/', async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required',
      });
    }

    // Geocode the address to get coordinates
    const coords = await geocodeLocation(address);

    if (!coords) {
      return res.status(404).json({
        success: false,
        error: 'Could not geocode address',
      });
    }

    // Infer timezone from coordinates
    let timezone = null;
    try {
      timezone = await inferTimezone(coords.lat, coords.lng);
    } catch (error) {
      logger.warn('Could not infer timezone:', error.message);
      // Return coordinates even if timezone inference fails
    }

    return res.json({
      success: true,
      address,
      lat: coords.lat,
      lng: coords.lng,
      timezone: timezone || 'UTC',
    });
  } catch (error) {
    logger.error('Error in geocoding API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

module.exports = router;
