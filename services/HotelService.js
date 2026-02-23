/**
 * Hotel Service
 * Extends TravelItemService with hotel-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const geocodingService = require('./geocodingService');

class HotelService extends TravelItemService {
  constructor(Hotel) {
    super(Hotel, 'Hotel', 'hotel');
  }

  /**
   * Prepare hotel data for creation/update
   * Handles hotel-specific: datetime parsing, timezone conversion, address geocoding
   */
  async prepareHotelData(data) {
    try {
      return await this.prepareItemData(data, {
        datePairs: ['checkIn', 'checkOut'],
        timezoneFields: ['addressTimezone'],
        locationFields: ['address'],
        geocodeService: geocodingService,
        dateTimeFields: ['checkInDateTime', 'checkOutDateTime'],
        tzPairs: ['addressTimezone', 'addressTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing hotel data:', error);
      throw error;
    }
  }
}

module.exports = HotelService;
