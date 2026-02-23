/**
 * Transportation Service
 * Extends TravelItemService with transportation-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const geocodingService = require('./geocodingService');

class TransportationService extends TravelItemService {
  constructor(Transportation) {
    super(Transportation, 'Transportation', 'transportation');
  }

  /**
   * Prepare transportation data for creation/update
   * Handles transportation-specific: datetime parsing, timezone conversion, location geocoding
   */
  async prepareTransportationData(data) {
    try {
      return await this.prepareItemData(data, {
        datePairs: ['pickup', 'dropoff'],
        timezoneFields: ['originTimezone', 'destinationTimezone'],
        locationFields: ['origin', 'destination'],
        geocodeService: geocodingService,
        dateTimeFields: ['pickupDateTime', 'dropoffDateTime'],
        tzPairs: ['originTimezone', 'destinationTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing transportation data:', error);
      throw error;
    }
  }
}

module.exports = TransportationService;
