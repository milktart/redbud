const { Op } = require('sequelize');
const { Airport } = require('../models');
const airlines = require('../data/airlines.json');
const logger = require('../utils/logger');

class AirportService {
  /**
   * Find airport by IATA code
   * @param {string} iataCode - 3-letter IATA airport code (e.g., "JFK")
   * @returns {Promise<object|null>} Airport object or null if not found
   */
  async getAirportByCode(iataCode) {
    try {
      if (!iataCode || typeof iataCode !== 'string') return null;

      const code = iataCode.toUpperCase().trim();

      // Fetch from database
      const airport = await Airport.findOne({ where: { iata: code } });

      if (!airport) return null;

      // Return normalized format for backward compatibility
      const result = {
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        lat: airport.latitude,
        lng: airport.longitude,
        latitude: airport.latitude, // Legacy compatibility
        longitude: airport.longitude, // Legacy compatibility
        airport_name: airport.name, // Legacy compatibility
        city_name: airport.city, // Legacy compatibility
        country_name: airport.country, // Legacy compatibility
        timezone: airport.timezone,
      };

      return result;
    } catch (error) {
      logger.error('Error fetching airport by code:', error);
      return null;
    }
  }

  /**
   * Search airports by name or city
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<array>} Array of matching airports
   */
  async searchAirports(query, limit = 10) {
    try {
      if (!query || typeof query !== 'string') return [];

      const searchTerm = query.toLowerCase().trim();

      // Fetch from database
      const airports = await Airport.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${searchTerm}%` } },
            { city: { [Op.iLike]: `%${searchTerm}%` } },
            { iata: { [Op.iLike]: `%${searchTerm}%` } },
          ],
        },
        limit,
        order: [
          // Prioritize exact IATA matches
          [Airport.sequelize.literal(`CASE WHEN LOWER(iata) = '${searchTerm}' THEN 0 ELSE 1 END`)],
          // Then exact city matches
          [Airport.sequelize.literal(`CASE WHEN LOWER(city) = '${searchTerm}' THEN 0 ELSE 1 END`)],
          ['name', 'ASC'],
        ],
      });

      // Return normalized format for backward compatibility
      const results = airports.map((airport) => ({
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        lat: airport.latitude,
        lng: airport.longitude,
        latitude: airport.latitude,
        longitude: airport.longitude,
        airport_name: airport.name,
        city_name: airport.city,
        country_name: airport.country,
        timezone: airport.timezone,
      }));

      return results;
    } catch (error) {
      logger.error('Error searching airports:', error);
      return [];
    }
  }

  /**
   * Get airline by IATA code
   * @param {string} iataCode - 2-letter IATA airline code (e.g., "AA")
   * @returns {object|null} Airline object or null if not found
   */
  getAirlineByCode(iataCode) {
    if (!iataCode || typeof iataCode !== 'string') return null;

    const code = iataCode.toUpperCase().trim();
    return airlines.find((airline) => airline.iata === code) || null;
  }

  /**
   * Extract airline code from flight number
   * @param {string} flightNumber - Flight number (e.g., "AA100", "BA456")
   * @returns {string|null} Airline IATA code or null
   */
  getAirlineCodeFromFlightNumber(flightNumber) {
    if (!flightNumber || typeof flightNumber !== 'string') return null;

    const cleaned = flightNumber.trim().toUpperCase();

    // Try to match 2-letter airline code at the beginning
    const match = cleaned.match(/^([A-Z]{2})/);
    if (match) {
      const code = match[1];
      // Verify it's a valid airline code
      const airline = this.getAirlineByCode(code);
      return airline ? code : null;
    }

    // Try to match 1-letter and 1-digit pattern (like B6, F9)
    const singleMatch = cleaned.match(/^([A-Z]\d)/);
    if (singleMatch) {
      const code = singleMatch[1];
      const airline = this.getAirlineByCode(code);
      return airline ? code : null;
    }

    // Try to match digit-letter pattern (like 5J, 6E, 7C, 9C, 9W, 3U)
    const digitMatch = cleaned.match(/^(\d[A-Z])/);
    if (digitMatch) {
      const code = digitMatch[1];
      const airline = this.getAirlineByCode(code);
      return airline ? code : null;
    }

    return null;
  }

  /**
   * Get airline name from flight number
   * @param {string} flightNumber - Flight number (e.g., "AA100")
   * @returns {string|null} Airline name or null
   */
  getAirlineNameFromFlightNumber(flightNumber) {
    const code = this.getAirlineCodeFromFlightNumber(flightNumber);
    if (!code) return null;

    const airline = this.getAirlineByCode(code);
    return airline ? airline.name : null;
  }

  /**
   * Parse flight number to get airline code and number
   * @param {string} flightNumber - Flight number (e.g., "AA100")
   * @returns {object} Object with airlineCode and flightNum
   */
  parseFlightNumber(flightNumber) {
    if (!flightNumber || typeof flightNumber !== 'string') {
      return { airlineCode: null, flightNum: null };
    }

    const cleaned = flightNumber.trim().toUpperCase();

    // Try 2-letter code
    let match = cleaned.match(/^([A-Z]{2})(\d+)$/);
    if (match && this.getAirlineByCode(match[1])) {
      return { airlineCode: match[1], flightNum: match[2] };
    }

    // Try letter-digit code (B6, F9)
    match = cleaned.match(/^([A-Z]\d)(\d+)$/);
    if (match && this.getAirlineByCode(match[1])) {
      return { airlineCode: match[1], flightNum: match[2] };
    }

    // Try digit-letter code (5J, 6E)
    match = cleaned.match(/^(\d[A-Z])(\d+)$/);
    if (match && this.getAirlineByCode(match[1])) {
      return { airlineCode: match[1], flightNum: match[2] };
    }

    return { airlineCode: null, flightNum: null };
  }

  /**
   * Get all airports (for autocomplete, etc.)
   * WARNING: This method loads all airports and should be used sparingly
   * Consider using searchAirports() with pagination instead
   * @param {number} limit - Optional limit (default: no limit)
   * @returns {Promise<array>} All airports
   */
  async getAllAirports(limit = null) {
    try {
      const query = {
        order: [['name', 'ASC']],
      };

      if (limit) {
        query.limit = limit;
      }

      const airports = await Airport.findAll(query);

      // Return normalized format for backward compatibility
      return airports.map((airport) => ({
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        lat: airport.latitude,
        lng: airport.longitude,
        latitude: airport.latitude,
        longitude: airport.longitude,
        airport_name: airport.name,
        city_name: airport.city,
        country_name: airport.country,
        timezone: airport.timezone,
      }));
    } catch (error) {
      logger.error('Error fetching all airports:', error);
      return [];
    }
  }

  /**
   * Get all airlines
   * @returns {array} All airlines
   */
  getAllAirlines() {
    return airlines;
  }
}

module.exports = new AirportService();
