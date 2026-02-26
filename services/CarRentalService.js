/**
 * Car Rental Service
 * Extends TravelItemService with car rental-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const airportService = require('./airportService');

class CarRentalService extends TravelItemService {
  constructor(CarRental) {
    super(CarRental, 'CarRental', 'car_rental');
  }

  /**
   * Prepare car rental data for creation/update
   * Handles car rental-specific: datetime parsing, timezone conversion, location geocoding
   */
  async prepareCarRentalData(data) {
    try {
      return await this.prepareItemData(data, {
        datePairs: ['pickup', 'dropoff'],
        timezoneFields: ['pickupTimezone', 'dropoffTimezone'],
        locationFields: ['pickupLocation', 'dropoffLocation'],
        geocodeService: airportService,
        dateTimeFields: ['pickupDateTime', 'dropoffDateTime'],
        tzPairs: ['pickupTimezone', 'dropoffTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing car rental data:', error);
      throw error;
    }
  }
}

module.exports = CarRentalService;
