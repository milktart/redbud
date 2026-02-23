/**
 * Flight Service
 * Extends TravelItemService with flight-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const airportService = require('./airportService');

class FlightService extends TravelItemService {
  constructor(Flight) {
    super(Flight, 'Flight', 'flight');
  }

  /**
   * Prepare flight data for creation/update
   * Handles flight-specific: datetime parsing, timezone conversion, airport geocoding
   */
  async prepareFlightData(data) {
    try {
      return await this.prepareItemData(data, {
        datePairs: ['departure', 'arrival'],
        timezoneFields: ['originTimezone', 'destinationTimezone'],
        locationFields: ['origin', 'destination'],
        geocodeService: airportService,
        dateTimeFields: ['departureDateTime', 'arrivalDateTime'],
        tzPairs: ['originTimezone', 'destinationTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing flight data:', error);
      throw error;
    }
  }
}

module.exports = FlightService;
