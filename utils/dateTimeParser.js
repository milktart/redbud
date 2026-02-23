/**
 * Centralized DateTime parsing and handling
 * Eliminates repetitive date/time parsing logic across all controllers
 * Handles both separate date/time fields and combined datetime strings
 * Note: sanitizeTimezone is imported from timezoneHelper (source of truth for timezone sanitization)
 */

const { sanitizeTimezone } = require('./timezoneHelper');

/**
 * Combine separate date and time fields into a single datetime string
 * Handles multiple date/time pairs for different fields (e.g., departure/arrival, checkIn/checkOut)
 * @param {Object} data - Request body object with date/time fields
 * @param {string[]} dateTimeFieldPairs - Array of field names (e.g., ['departure', 'arrival'])
 *                                        Will look for ${fieldName}Date, ${fieldName}Time, ${fieldName}DateTime
 * @returns {Object} Modified data object with combined datetime fields
 * @example
 * // Before: { departureDate: '2024-01-15', departureTime: '14:30', arrivalDate: '2024-01-15', arrivalTime: '17:45' }
 * // After: { departureDateTime: '2024-01-15T14:30', arrivalDateTime: '2024-01-15T17:45' }
 * combineDateTimeFields(data, ['departure', 'arrival']);
 */
function combineDateTimeFields(data, dateTimeFieldPairs = []) {
  const modifiedData = { ...data };

  dateTimeFieldPairs.forEach((fieldName) => {
    const dateKey = `${fieldName}Date`;
    const timeKey = `${fieldName}Time`;
    const dateTimeKey = `${fieldName}DateTime`;

    // If already combined datetime, leave as-is
    if (modifiedData[dateTimeKey]) {
      // Already combined, nothing to do
      return;
    }

    // If separate date/time provided, combine them
    if (modifiedData[dateKey]) {
      const time = modifiedData[timeKey] || '00:00';
      modifiedData[dateTimeKey] = `${modifiedData[dateKey]}T${time}`;

      // Remove separate fields (optional, but cleaner)
      delete modifiedData[dateKey];
      delete modifiedData[timeKey];
    }
  });

  return modifiedData;
}

/**
 * Sanitize multiple timezone fields
 * Converts empty/undefined strings to null for each timezone field
 * @param {Object} data - Data object containing timezone fields
 * @param {string[]} timezoneFields - Array of timezone field names
 * @returns {Object} Modified data object with sanitized timezones
 * @example
 * // Before: { originTimezone: 'undefined', destinationTimezone: '', pickupTimezone: 'America/New_York' }
 * // After: { originTimezone: null, destinationTimezone: null, pickupTimezone: 'America/New_York' }
 * sanitizeTimezones(data, ['originTimezone', 'destinationTimezone', 'pickupTimezone']);
 */
function sanitizeTimezones(data, timezoneFields = []) {
  const modifiedData = { ...data };

  timezoneFields.forEach((field) => {
    modifiedData[field] = sanitizeTimezone(modifiedData[field]);
  });

  return modifiedData;
}

/**
 * Complete datetime preparation for item creation/update
 * Combines date/time fields and sanitizes timezone fields in one call
 * @param {Object} data - Request body object
 * @param {Object} config - Configuration object
 * @param {string[]} config.dateTimeFields - Pairs like ['departure', 'arrival']
 * @param {string[]} config.timezoneFields - Fields like ['originTimezone', 'destinationTimezone']
 * @returns {Object} Prepared data object
 * @example
 * const prepared = prepareDateTime(req.body, {
 *   dateTimeFields: ['departure', 'arrival'],
 *   timezoneFields: ['originTimezone', 'destinationTimezone']
 * });
 */
function prepareDateTime(data, config = {}) {
  const { dateTimeFields = [], timezoneFields = [] } = config;

  let result = data;

  if (dateTimeFields.length > 0) {
    result = combineDateTimeFields(result, dateTimeFields);
  }

  if (timezoneFields.length > 0) {
    result = sanitizeTimezones(result, timezoneFields);
  }

  return result;
}

module.exports = {
  combineDateTimeFields,
  sanitizeTimezones,
  prepareDateTime,
};
