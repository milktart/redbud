/**
 * Car Rental Service
 * Extends TravelItemService with car rental-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const geocodingService = require('./geocodingService');

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
        timezoneFields: ['pickupLocationTimezone', 'dropoffLocationTimezone'],
        locationFields: ['pickupLocation', 'dropoffLocation'],
        geocodeService: geocodingService,
        dateTimeFields: ['pickupDateTime', 'dropoffDateTime'],
        tzPairs: ['pickupLocationTimezone', 'dropoffLocationTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing car rental data:', error);
      throw error;
    }
  }
}

module.exports = CarRentalService;
