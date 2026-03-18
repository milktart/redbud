/**
 * Event Service
 * Extends TravelItemService with event-specific business logic
 */

const TravelItemService = require('./TravelItemService');
const logger = require('../utils/logger');
const geocodingService = require('./geocodingService');
const DateTimeService = require('./DateTimeService');

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
      // Step 1: Combine date/time fields into datetimes
      let processed = DateTimeService.combineDateTimeFields(data, ['start', 'end']);

      // Step 2: Sanitize timezone fields
      processed = DateTimeService.sanitizeTimezones(processed, ['startTimezone', 'endTimezone']);

      // Step 3: Geocode location (no airport lookup — events are venues/addresses)
      if (processed.location) {
        const coords = await geocodingService.geocodeLocation(processed.location);
        if (coords) {
          processed.lat = coords.lat;
          processed.lng = coords.lng;
        }
      }

      // Step 4: Convert datetimes to UTC using event's timezone
      if (processed.startDateTime) {
        processed.startDateTime = DateTimeService.convertToUTC(
          processed.startDateTime,
          processed.startTimezone
        );
      }
      if (processed.endDateTime) {
        processed.endDateTime = DateTimeService.convertToUTC(
          processed.endDateTime,
          processed.startTimezone
        );
      }

      return processed;
    } catch (error) {
      logger.error('Error preparing event data:', error);
      throw error;
    }
  }
}

module.exports = EventService;
