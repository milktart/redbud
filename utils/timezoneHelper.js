/**
 * Timezone Helper
 * Handles conversion between local times and UTC for proper storage
 * Uses native Intl API for reliable timezone conversions (no external dependencies)
 */

const logger = require('./logger');

/**
 * Parse UTC offset string (e.g., "UTC-5", "UTC+3") and return offset in minutes
 * Returns null if the string is not a UTC offset format
 */
function parseUtcOffset(timezone) {
  if (!timezone || !timezone.startsWith('UTC')) return null;

  const match = timezone.match(/^UTC([+-])(\d+)(?::(\d+))?$/);
  if (!match) return null;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}

/**
 * Validate if a timezone is a valid IANA timezone name
 */
function isValidIanaTimezone(timezone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a datetime-local string (without timezone) to UTC Date object
 * This interprets the datetime as being in the specified timezone
 *
 * @param {string} datetimeLocal - Format: "YYYY-MM-DDTHH:MM" (from datetime-local input)
 * @param {string} timezone - IANA timezone string (e.g., "America/New_York") or UTC offset (e.g., "UTC-5")
 * @returns {Date} - Date object in UTC
 *
 * Example:
 *   localToUTC("2025-10-14T14:30", "America/New_York")
 *   -> Returns Date object representing 2025-10-14 14:30 EDT converted to UTC
 *   localToUTC("2025-10-14T14:30", "UTC-5")
 *   -> Returns Date object representing 2025-10-14 14:30 UTC-5 converted to UTC
 */
function localToUTC(datetimeLocal, timezone) {
  if (!datetimeLocal) return null;

  try {
    // If no timezone provided, treat as UTC (fallback)
    if (!timezone) {
      // Parse as UTC by appending Z
      return new Date(`${datetimeLocal}Z`);
    }

    // Check if it's a UTC offset format (e.g., "UTC-5")
    const offsetMinutes = parseUtcOffset(timezone);
    if (offsetMinutes !== null) {
      // Parse as UTC, then subtract the offset to get the actual UTC time
      // If local time is 14:30 in UTC-5, UTC time is 14:30 + 5 hours = 19:30
      const utcDate = new Date(`${datetimeLocal}Z`);
      if (Number.isNaN(utcDate.getTime())) {
        logger.error('Invalid datetime:', datetimeLocal);
        return null;
      }
      // Subtract the offset (negative UTC offsets mean add to get UTC)
      return new Date(utcDate.getTime() - offsetMinutes * 60 * 1000);
    }

    // For IANA timezones, use a simpler approach:
    // Create a date string in the local timezone and parse it
    // The trick is to use toLocaleString to get the UTC time, then calculate the offset

    // Parse the input datetime parts
    const parts = datetimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!parts) {
      logger.error('Invalid datetime format:', datetimeLocal);
      return null;
    }

    const [, year, month, day, hour, minute, second = '00'] = parts;

    // Validate timezone
    if (!isValidIanaTimezone(timezone)) {
      logger.warn(`Invalid timezone "${timezone}" - treating as UTC`);
      return new Date(`${datetimeLocal}Z`);
    }

    // Create two Date objects:
    // 1. A date in UTC with the given date/time values
    // 2. Format that same UTC moment in the target timezone to see what the local time would be

    // Start with a reference UTC date (midnight UTC on the target date)
    const referenceUTC = new Date(`${year}-${month}-${day}T00:00:00Z`);

    // Format this UTC date as it would appear in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Format and parse the result to get the timezone offset at this moment
    const formatted = formatter.format(referenceUTC);
    // Format can be "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD, HH:mm:ss" depending on locale
    const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) {
      logger.error('Failed to parse formatted timezone string:', { formatted, timezone });
      return null;
    }

    const [, refYear, refMonth, refDay, refHour, refMinute, refSecond] = match;

    // The reference UTC time (midnight), when displayed in the target timezone, shows these values
    // Calculate how many milliseconds the timezone shifted the time
    const displayedInTZ = new Date(
      `${refYear}-${refMonth}-${refDay}T${refHour}:${refMinute}:${refSecond}Z`
    );
    const offset = referenceUTC.getTime() - displayedInTZ.getTime();

    // Now create a UTC date for our desired local time by applying the offset in reverse
    const desiredUTC = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const result = new Date(desiredUTC.getTime() + offset);

    if (Number.isNaN(result.getTime())) {
      logger.error('Invalid result date after offset calculation:', {
        desiredUTC: desiredUTC.toISOString(),
        offset,
        resultTime: result.getTime(),
      });
      return null;
    }

    return result;
  } catch (error) {
    logger.error('Error converting local to UTC:', error, { datetimeLocal, timezone });
    // Return null on error instead of creating an invalid date
    return null;
  }
}

/**
 * Convert UTC Date to local datetime string for datetime-local input
 *
 * @param {Date|string} utcDate - UTC date
 * @param {string} timezone - IANA timezone string or UTC offset (e.g., "UTC-5")
 * @returns {string} - Format: "YYYY-MM-DDTHH:MM" for datetime-local input
 *
 * Example:
 *   utcToLocal(utcDateObject, "America/New_York")
 *   -> Returns "2025-10-14T14:30" (representing the time in New York)
 *   utcToLocal(utcDateObject, "UTC-5")
 *   -> Returns "2025-10-14T14:30" (representing the time in UTC-5)
 */
function utcToLocal(utcDate, timezone) {
  if (!utcDate) return '';

  try {
    const date = new Date(utcDate);

    if (Number.isNaN(date.getTime())) {
      logger.error('Invalid UTC date:', utcDate);
      return '';
    }

    // Convert to specified timezone if provided
    if (timezone) {
      // Check if it's a UTC offset format (e.g., "UTC-5")
      const offsetMinutes = parseUtcOffset(timezone);
      if (offsetMinutes !== null) {
        // Apply the offset to get local time
        const localDate = new Date(date.getTime() + offsetMinutes * 60 * 1000);
        const year = localDate.getUTCFullYear();
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        const hours = String(localDate.getUTCHours()).padStart(2, '0');
        const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      // Validate IANA timezone
      if (!isValidIanaTimezone(timezone)) {
        logger.warn(`Invalid timezone "${timezone}" - falling back to UTC`);
        return utcToLocal(utcDate, null);
      }

      // Use Intl.DateTimeFormat to convert to timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      });

      const parts = formatter.formatToParts(date);
      const values = {};
      parts.forEach((part) => {
        if (part.type !== 'literal') {
          values[part.type] = part.value;
        }
      });

      return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
    }

    // Return in UTC if no timezone specified
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    logger.error('Error converting UTC to local:', error, { utcDate, timezone });
    return '';
  }
}

/**
 * Format a UTC date for display in a specific timezone
 *
 * @param {Date|string} utcDate - UTC date
 * @param {string} timezone - IANA timezone string or UTC offset
 * @param {string} format - Format string (default: 'DD MMM YYYY HH:mm')
 * @returns {string} - Formatted date string
 */
function formatInTimezone(utcDate, timezone, format = 'DD MMM YYYY HH:mm') {
  if (!utcDate) return '';

  try {
    const date = new Date(utcDate);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    // Convert to timezone-aware datetime string first
    const localString = utcToLocal(date, timezone);
    if (!localString) return '';

    // Parse the YYYY-MM-DDTHH:mm format
    const match = localString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return '';

    const [, year, month, day, hour, minute] = match;

    // Convert month number to name
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthName = monthNames[parseInt(month, 10) - 1];

    // Format based on the requested format
    // Supporting most common formats used in the codebase
    if (format === 'DD MMM YYYY HH:mm') {
      return `${day} ${monthName} ${year} ${hour}:${minute}`;
    }
    if (format === 'DD MMM YYYY') {
      return `${day} ${monthName} ${year}`;
    }
    if (format === 'HH:mm') {
      return `${hour}:${minute}`;
    }
    if (format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    }

    // Default fallback
    return `${day} ${monthName} ${year} ${hour}:${minute}`;
  } catch (error) {
    logger.error('Error formatting in timezone:', error);
    return '';
  }
}

/**
 * Sanitize timezone input from form (handles "undefined" string)
 * Eliminates 4-6 duplicate timezone checks across controllers
 */
function sanitizeTimezone(tz) {
  if (!tz || tz === 'undefined' || (typeof tz === 'string' && tz.trim() === '')) {
    return null;
  }
  return tz;
}

module.exports = {
  localToUTC,
  utcToLocal,
  formatInTimezone,
  sanitizeTimezone,
};
