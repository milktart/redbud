/**
 * Date/Time Service
 * Consolidates all datetime and timezone handling into a single service
 * Eliminates scattered date/time logic across utilities and controllers
 *
 * Functions provided:
 * - combineDateTimeFields() - Merge separate date/time fields into datetime
 * - sanitizeTimezones() - Clean timezone values
 * - convertToUTC() - Convert local datetime to UTC
 * - utcToLocal() - Convert UTC to local datetime
 * - formatInTimezone() - Format date for display in specific timezone
 * - validateISODate() - Validate ISO date format
 * - isValidTimezone() - Check if timezone is valid IANA timezone
 */

const logger = require('../utils/logger');
const { combineDateTimeFields, sanitizeTimezones } = require('../utils/dateTimeParser');
const {
  localToUTC,
  utcToLocal,
  formatInTimezone: formatInTimezoneHelper,
  sanitizeTimezone,
  isValidIanaTimezone,
} = require('../utils/timezoneHelper');

class DateTimeService {
  /**
   * Combine separate date and time fields into ISO datetime string
   * @param {Object} data - Data object with date/time fields
   * @param {string[]} fieldPairs - Field names to combine (e.g., ['departure', 'arrival'])
   * @returns {Object} Data with combined datetime fields
   * @example
   * combineDateTimeFields(
   *   { departureDate: '2024-01-15', departureTime: '14:30' },
   *   ['departure']
   * )
   * // Returns { departureDateTime: '2024-01-15T14:30' }
   */
  static combineDateTimeFields(data, fieldPairs = []) {
    return combineDateTimeFields(data, fieldPairs);
  }

  /**
   * Sanitize multiple timezone fields
   * Converts empty/undefined strings to null
   * @param {Object} data - Data object
   * @param {string[]} timezoneFields - Timezone field names to sanitize
   * @returns {Object} Data with sanitized timezones
   * @example
   * sanitizeTimezones(
   *   { originTimezone: 'undefined', destinationTimezone: 'America/New_York' },
   *   ['originTimezone', 'destinationTimezone']
   * )
   * // Returns { originTimezone: null, destinationTimezone: 'America/New_York' }
   */
  static sanitizeTimezones(data, timezoneFields = []) {
    return sanitizeTimezones(data, timezoneFields);
  }

  /**
   * Sanitize a single timezone value
   * @param {string} timezone - Timezone value to sanitize
   * @returns {string|null} Sanitized timezone or null
   */
  static sanitizeTimezone(timezone) {
    return sanitizeTimezone(timezone);
  }

  /**
   * Convert local datetime to UTC
   * Interprets datetime as being in the specified timezone
   * @param {string} datetimeLocal - ISO datetime string (YYYY-MM-DDTHH:MM)
   * @param {string} timezone - IANA timezone or UTC offset (e.g., "America/New_York", "UTC-5")
   * @returns {Date} UTC Date object
   * @example
   * convertToUTC('2024-01-15T14:30', 'America/New_York')
   * // Returns Date object for 2024-01-15 14:30 EST converted to UTC
   */
  static convertToUTC(datetimeLocal, timezone) {
    if (!datetimeLocal) return null;
    return localToUTC(datetimeLocal, timezone);
  }

  /**
   * Convert UTC date to local datetime string
   * @param {Date|string} utcDate - UTC date
   * @param {string} timezone - IANA timezone or UTC offset
   * @returns {string} Local datetime string (YYYY-MM-DDTHH:MM)
   * @example
   * utcToLocal(new Date('2024-01-15T19:30Z'), 'America/New_York')
   * // Returns '2024-01-15T14:30' (EST)
   */
  static utcToLocal(utcDate, timezone) {
    return utcToLocal(utcDate, timezone);
  }

  /**
   * Format UTC date for display in specific timezone
   * @param {Date|string} utcDate - UTC date
   * @param {string} timezone - IANA timezone or UTC offset
   * @param {string} format - Display format (default: 'DD MMM YYYY HH:mm')
   * @returns {string} Formatted date string
   * @example
   * formatInTimezone(new Date('2024-01-15T19:30Z'), 'America/New_York', 'DD MMM YYYY HH:mm')
   * // Returns '15 Jan 2024 14:30'
   */
  static formatInTimezone(utcDate, timezone, format = 'DD MMM YYYY HH:mm') {
    return formatInTimezoneHelper(utcDate, timezone, format);
  }

  /**
   * Validate if date string is in ISO format (YYYY-MM-DD)
   * @param {string} dateStr - Date string to validate
   * @returns {boolean} True if valid ISO date
   */
  static validateISODate(dateStr) {
    if (!dateStr) return false;
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRegex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !Number.isNaN(date.getTime());
  }

  /**
   * Check if timezone is a valid IANA timezone
   * @param {string} timezone - Timezone to validate
   * @returns {boolean} True if valid IANA timezone
   */
  static isValidTimezone(timezone) {
    if (!timezone) return false;
    return isValidIanaTimezone(timezone);
  }

  /**
   * Complete datetime preparation for item creation/update
   * Combines the most common datetime operations into one call
   * @param {Object} data - Raw item data
   * @param {Object} config - Processing configuration
   * @param {string[]} config.datePairs - Date/time field pairs to combine
   * @param {string[]} config.timezoneFields - Timezone fields to sanitize
   * @param {string[]} config.dateTimeFields - DateTime fields to convert to UTC
   * @param {string[]} config.tzPairs - Timezone fields corresponding to each datetime field
   * @returns {Object} Processed data ready for database
   * @example
   * const prepared = DateTimeService.prepareDateTime(req.body, {
   *   datePairs: ['departure', 'arrival'],
   *   timezoneFields: ['originTimezone', 'destinationTimezone'],
   *   dateTimeFields: ['departureDateTime', 'arrivalDateTime'],
   *   tzPairs: ['originTimezone', 'destinationTimezone']
   * });
   */
  static prepareDateTime(data, config = {}) {
    try {
      let result = { ...data };

      // Step 1: Combine date/time fields if specified
      if (config.datePairs && config.datePairs.length > 0) {
        result = this.combineDateTimeFields(result, config.datePairs);
      }

      // Step 2: Sanitize timezone fields if specified
      if (config.timezoneFields && config.timezoneFields.length > 0) {
        result = this.sanitizeTimezones(result, config.timezoneFields);
      }

      // Step 3: Convert datetime fields to UTC if specified
      if (config.dateTimeFields && config.tzPairs && config.dateTimeFields.length > 0) {
        config.dateTimeFields.forEach((dtField, index) => {
          const tzField = config.tzPairs[index];

          if (result[dtField]) {
            result[dtField] = this.convertToUTC(result[dtField], result[tzField]);
          }
        });
      }

      return result;
    } catch (error) {
      logger.error('Error preparing datetime:', error);
      throw error;
    }
  }
}

module.exports = DateTimeService;
