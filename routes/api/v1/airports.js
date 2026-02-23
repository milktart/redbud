/**
 * API v1 - Airport Routes
 * AJAX endpoints for airport autocomplete and lookup
 */

const express = require('express');
const airportService = require('../../../services/airportService');
const logger = require('../../../utils/logger');
const { requireAdmin } = require('../../../middleware/auth');
const { Airport } = require('../../../models');

const router = express.Router();

/**
 * GET /api/v1/airports/admin/all
 * Get all airports (admin only)
 * Returns list of all airports in the database
 */
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const airports = await Airport.findAll({
      attributes: ['iata', 'icao', 'name', 'city', 'country', 'latitude', 'longitude', 'timezone'],
      order: [['name', 'ASC']],
    });

    res.json({ success: true, airports });
  } catch (error) {
    logger.error('Error fetching all airports:', error);
    res.status(500).json({ success: false, message: 'Error fetching airports' });
  }
});

/**
 * GET /api/v1/airports/search
 * Search airports by query string (IATA code, name, or city)
 *
 * Used for autocomplete in flight and transportation forms
 * Supports searching by IATA code, airport name, or city name
 *
 * @query {string} q - Search query (required, minimum 2 characters)
 *   - Search by IATA code (e.g., "JFK"), airport name (e.g., "Kennedy"), or city (e.g., "New York")
 * @query {number} [limit=10] - Maximum results to return (default: 10, max: 50)
 *
 * @returns {Object} 200 OK response with search results
 * @returns {boolean} returns.success - Always true on successful search
 * @returns {string} returns.query - The search query used
 * @returns {number} returns.count - Number of results returned
 * @returns {Array} returns.airports - Array of matching airport objects
 * @returns {string} returns.airports[].iata - 3-letter IATA code (e.g., "JFK")
 * @returns {string} returns.airports[].name - Full airport name
 * @returns {string} returns.airports[].city - City name
 * @returns {string} returns.airports[].country - Country name
 * @returns {string} returns.airports[].timezone - IANA timezone string
 * @returns {number} returns.airports[].latitude - Airport latitude
 * @returns {number} returns.airports[].longitude - Airport longitude
 * @returns {string} [returns.airports[].type] - Airport type (international, regional, etc.)
 *
 * @throws {400} Bad request - Query parameter missing or too short
 * @throws {500} Server error - Database or service error
 *
 * @note No authentication required for airport search
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit } = req.query;

    // Validate query parameter
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required and must be at least 2 characters',
      });
    }

    // Parse limit with default and bounds
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    // Search airports using service
    const airports = await airportService.searchAirports(query, parsedLimit);

    // Return results
    return res.json({
      success: true,
      query,
      count: airports.length,
      airports,
    });
  } catch (error) {
    logger.error('Error in airport search API', { error: error.message, query: req.query });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PUT /api/v1/airports/:iata
 * Update an airport (admin only)
 * Updates airport details by IATA code
 */
router.put('/:iata', requireAdmin, async (req, res) => {
  try {
    const { iata } = req.params;
    const { icao, name, city, country, latitude, longitude, timezone } = req.body;

    // Validate IATA code format
    if (!iata || !/^[A-Z]{3}$/i.test(iata)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IATA code. Must be 3 letters.',
      });
    }

    // Find airport
    const airport = await Airport.findByPk(iata);
    if (!airport) {
      return res.status(404).json({
        success: false,
        message: 'Airport not found',
      });
    }

    // Update fields
    if (icao !== undefined) airport.icao = icao;
    if (name !== undefined) airport.name = name;
    if (city !== undefined) airport.city = city;
    if (country !== undefined) airport.country = country;
    if (latitude !== undefined) airport.latitude = latitude;
    if (longitude !== undefined) airport.longitude = longitude;
    if (timezone !== undefined) airport.timezone = timezone;

    await airport.save();

    res.json({
      success: true,
      airport: {
        iata: airport.iata,
        icao: airport.icao,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        latitude: airport.latitude,
        longitude: airport.longitude,
        timezone: airport.timezone,
      },
    });
  } catch (error) {
    logger.error('Error updating airport:', error);
    res.status(500).json({ success: false, message: 'Error updating airport' });
  }
});

/**
 * GET /api/v1/airports/:iata
 * Get detailed airport information by IATA code
 *
 * Returns comprehensive airport data including coordinates, timezone, and type
 *
 * @param {string} req.params.iata - 3-letter IATA airport code (e.g., "JFK", "LHR", "CDG")
 *   - Must be exactly 3 uppercase letters
 *   - Case-insensitive (automatically converted to uppercase)
 *
 * @returns {Object} 200 OK response with airport details
 * @returns {boolean} returns.success - Always true on successful lookup
 * @returns {Object} returns.airport - Airport details object
 * @returns {string} returns.airport.iata - IATA code
 * @returns {string} returns.airport.name - Full airport name
 * @returns {string} returns.airport.city - City name
 * @returns {string} returns.airport.state - State/province if applicable
 * @returns {string} returns.airport.country - Country name
 * @returns {number} returns.airport.latitude - Airport latitude
 * @returns {number} returns.airport.longitude - Airport longitude
 * @returns {string} returns.airport.timezone - IANA timezone string (e.g., "America/New_York")
 * @returns {string} [returns.airport.type] - Airport type (international, regional, etc.)
 * @returns {Array} [returns.airport.aliases] - Alternative names for airport
 *
 * @throws {400} Bad request - Invalid IATA code format (not exactly 3 letters)
 * @throws {404} Not found - Airport with this IATA code not found
 * @throws {500} Server error - Database or service error
 *
 * @note No authentication required for airport lookup
 *
 * @example
 * GET /api/v1/airports/JFK
 * Response: {
 *   "success": true,
 *   "airport": {
 *     "iata": "JFK",
 *     "name": "John F. Kennedy International Airport",
 *     "city": "New York",
 *     "country": "United States",
 *     "timezone": "America/New_York",
 *     "latitude": 40.6413,
 *     "longitude": -73.7781
 *   }
 * }
 */
router.get('/:iata', async (req, res) => {
  try {
    const { iata } = req.params;

    // Validate IATA code format
    if (!iata || !/^[A-Z]{3}$/i.test(iata)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IATA code. Must be 3 letters.',
      });
    }

    // Get airport by code
    const airport = await airportService.getAirportByCode(iata);

    if (!airport) {
      return res.status(404).json({
        success: false,
        error: 'Airport not found',
      });
    }

    return res.json({
      success: true,
      airport,
    });
  } catch (error) {
    logger.error('Error in airport lookup API', { error: error.message, iata: req.params.iata });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

module.exports = router;
