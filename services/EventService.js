/**
 * Event Service
 * Extends TravelItemService with event-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const geocodingService = require('./geocodingService');

class EventService extends TravelItemService {
  constructor(Event) {
    super(Event, 'Event', 'event');
  }

  /**
   * Prepare event data for creation/update
   * Handles event-specific: datetime parsing, timezone conversion, location geocoding
   */
  async prepareEventData(data) {
    try {
      return await this.prepareItemData(data, {
        datePairs: ['start', 'end'],
        timezoneFields: ['locationTimezone'],
        locationFields: ['location'],
        geocodeService: geocodingService,
        dateTimeFields: ['startDateTime', 'endDateTime'],
        tzPairs: ['locationTimezone', 'locationTimezone'],
      });
    } catch (error) {
      logger.error('Error preparing event data:', error);
      throw error;
    }
  }
}

module.exports = EventService;
