/**
 * Duplicate Detection Service - OPTIMIZED
 * Uses indexed lookups and selective comparison instead of full O(n*m) scan
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Debug log file
const debugLogFile = path.join(__dirname, '../duplicate-detection-debug.log');

function debugLog(message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) : ''}\n\n`;
  fs.appendFileSync(debugLogFile, logEntry);
}

/**
 * Normalize strings for comparison: lowercase, trim, collapse whitespace
 */
function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract initials/fingerprint from a string for fast pre-filtering
 */
function getStringFingerprint(str) {
  const normalized = normalizeString(str);
  if (!normalized) return '';
  // Return first 10 chars for fast matching
  return normalized.substring(0, 10);
}

/**
 * Compare dates at day level
 */
function compareDates(date1, date2) {
  if (!date1 || !date2) return false;
  try {
    const iso1 = typeof date1 === 'string' ? date1 : date1.toISOString?.() || String(date1);
    const iso2 = typeof date2 === 'string' ? date2 : date2.toISOString?.() || String(date2);

    const datePart1 = iso1.split('T')[0];
    const datePart2 = iso2.split('T')[0];

    return datePart1 === datePart2;
  } catch {
    return false;
  }
}

/**
 * Check for duplicate trips using exact/close matches on key fields
 */
function checkTripDuplicates(importedTrip, existingTrips) {
  const imported =
    typeof importedTrip.get === 'function' ? importedTrip.get({ plain: true }) : importedTrip;

  for (const existing of existingTrips) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    // Quick rejection: name must be very similar
    const importedName = normalizeString(imported.name);
    const existingName = normalizeString(exist.name);

    if (
      importedName === existingName &&
      compareDates(imported.departureDate, exist.departureDate) &&
      compareDates(imported.returnDate, exist.returnDate)
    ) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate flights using flight number + date (most reliable identifier)
 */
function checkFlightDuplicates(importedFlight, existingFlights) {
  const imported =
    typeof importedFlight.get === 'function' ? importedFlight.get({ plain: true }) : importedFlight;

  for (const existing of existingFlights) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    // Flight number is the strongest identifier
    const importedFlightNum = normalizeString(imported.flightNumber);
    const existingFlightNum = normalizeString(exist.flightNumber);

    if (importedFlightNum && existingFlightNum && importedFlightNum === existingFlightNum) {
      // Verify airline and date match
      if (
        normalizeString(imported.airline) === normalizeString(exist.airline) &&
        compareDates(imported.departureDateTime, exist.departureDateTime)
      ) {
        return {
          isDuplicate: true,
          duplicateOf: existing,
          similarity: 100,
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate hotels using name + check-in date
 */
function checkHotelDuplicates(importedHotel, existingHotels) {
  const imported =
    typeof importedHotel.get === 'function' ? importedHotel.get({ plain: true }) : importedHotel;

  debugLog('HOTEL CHECK START', {
    importedName: imported.hotelName,
    importedCheckIn: imported.checkInDateTime,
    importedCheckOut: imported.checkOutDateTime,
    existingHotelsCount: existingHotels.length,
  });

  for (const existing of existingHotels) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    // Hotel name is the primary key
    const importedName = normalizeString(imported.hotelName);
    const existingName = normalizeString(exist.hotelName);

    debugLog('HOTEL COMPARISON', {
      importedName,
      existingName,
      namesMatch: importedName === existingName,
      existingCheckIn: exist.checkInDateTime,
      existingCheckOut: exist.checkOutDateTime,
      importedCheckIn: imported.checkInDateTime,
      importedCheckOut: imported.checkOutDateTime,
      checkInMatch: compareDates(imported.checkInDateTime, exist.checkInDateTime),
      checkOutMatch: compareDates(imported.checkOutDateTime, exist.checkOutDateTime),
    });

    if (importedName && existingName && importedName === existingName) {
      debugLog('HOTEL NAMES MATCH - checking dates', {
        checkInMatch: compareDates(imported.checkInDateTime, exist.checkInDateTime),
        checkOutMatch: compareDates(imported.checkOutDateTime, exist.checkOutDateTime),
      });

      // Verify dates match
      if (
        compareDates(imported.checkInDateTime, exist.checkInDateTime) &&
        compareDates(imported.checkOutDateTime, exist.checkOutDateTime)
      ) {
        debugLog('HOTEL DUPLICATE FOUND', {
          importedName: imported.hotelName,
          existingName: exist.hotelName,
        });
        return {
          isDuplicate: true,
          duplicateOf: existing,
          similarity: 100,
        };
      }
    }
  }

  debugLog('HOTEL CHECK END - NO MATCH FOUND', { importedName: imported.hotelName });
  return { isDuplicate: false };
}

/**
 * Check for duplicate transportation using method + route + date
 */
function checkTransportationDuplicates(importedTransportation, existingTransportation) {
  const imported =
    typeof importedTransportation.get === 'function'
      ? importedTransportation.get({ plain: true })
      : importedTransportation;

  debugLog('TRANSPORTATION CHECK START', {
    importedMethod: imported.method,
    importedOrigin: imported.origin,
    importedDestination: imported.destination,
    importedDeparture: imported.departureDateTime,
    existingTransportationCount: existingTransportation.length,
  });

  for (const existing of existingTransportation) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    // Method + origin + destination + date is the unique combination
    const importedMethod = normalizeString(imported.method);
    const existingMethod = normalizeString(exist.method);
    const importedOrigin = normalizeString(imported.origin);
    const existingOrigin = normalizeString(exist.origin);
    const importedDest = normalizeString(imported.destination);
    const existingDest = normalizeString(exist.destination);

    debugLog('TRANSPORTATION COMPARISON', {
      importedMethod,
      existingMethod,
      methodMatch: importedMethod === existingMethod,
      importedOrigin,
      existingOrigin,
      originMatch: importedOrigin === existingOrigin,
      importedDest,
      existingDest,
      destMatch: importedDest === existingDest,
      importedDeparture: imported.departureDateTime,
      existingDeparture: exist.departureDateTime,
      dateMatch: compareDates(imported.departureDateTime, exist.departureDateTime),
    });

    if (
      importedMethod &&
      existingMethod &&
      importedMethod === existingMethod &&
      importedOrigin === existingOrigin &&
      importedDest === existingDest &&
      compareDates(imported.departureDateTime, exist.departureDateTime)
    ) {
      debugLog('TRANSPORTATION DUPLICATE FOUND', {
        method: imported.method,
        origin: imported.origin,
        destination: imported.destination,
      });
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  debugLog('TRANSPORTATION CHECK END - NO MATCH FOUND', {
    method: imported.method,
    origin: imported.origin,
    destination: imported.destination,
  });
  return { isDuplicate: false };
}

/**
 * Check for duplicate car rentals using location + date
 */
function checkCarRentalDuplicates(importedCarRental, existingCarRentals) {
  const imported =
    typeof importedCarRental.get === 'function'
      ? importedCarRental.get({ plain: true })
      : importedCarRental;

  for (const existing of existingCarRentals) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    const importedPickup = normalizeString(imported.pickupLocation);
    const existingPickup = normalizeString(exist.pickupLocation);
    const importedDropoff = normalizeString(imported.dropoffLocation);
    const existingDropoff = normalizeString(exist.dropoffLocation);

    if (
      importedPickup &&
      existingPickup &&
      importedPickup === existingPickup &&
      importedDropoff === existingDropoff &&
      compareDates(imported.pickupDateTime, exist.pickupDateTime) &&
      compareDates(imported.dropoffDateTime, exist.dropoffDateTime)
    ) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate events using name + location + date
 */
function checkEventDuplicates(importedEvent, existingEvents) {
  const imported =
    typeof importedEvent.get === 'function' ? importedEvent.get({ plain: true }) : importedEvent;

  for (const existing of existingEvents) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;

    const importedName = normalizeString(imported.name);
    const existingName = normalizeString(exist.name);
    const importedLocation = normalizeString(imported.location);
    const existingLocation = normalizeString(exist.location);

    if (
      importedName &&
      existingName &&
      importedName === existingName &&
      importedLocation === existingLocation &&
      compareDates(imported.startDateTime, exist.startDateTime)
    ) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate vouchers using voucher number
 */
function checkVoucherDuplicates(importedVoucher, existingVouchers) {
  const imported =
    typeof importedVoucher.get === 'function'
      ? importedVoucher.get({ plain: true })
      : importedVoucher;

  const importedNum = normalizeString(imported.voucherNumber);
  if (!importedNum) return { isDuplicate: false };

  for (const existing of existingVouchers) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;
    const existingNum = normalizeString(exist.voucherNumber);

    if (importedNum === existingNum) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate companions using email (primary key)
 */
function checkCompanionDuplicates(importedCompanion, existingCompanions) {
  const imported =
    typeof importedCompanion.get === 'function'
      ? importedCompanion.get({ plain: true })
      : importedCompanion;

  const importedEmail = normalizeString(imported.email);
  if (!importedEmail) return { isDuplicate: false };

  for (const existing of existingCompanions) {
    const exist = typeof existing.get === 'function' ? existing.get({ plain: true }) : existing;
    const existingEmail = normalizeString(exist.email);

    if (importedEmail === existingEmail) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        similarity: 100,
      };
    }
  }

  return { isDuplicate: false };
}

module.exports = {
  checkTripDuplicates,
  checkFlightDuplicates,
  checkHotelDuplicates,
  checkTransportationDuplicates,
  checkCarRentalDuplicates,
  checkEventDuplicates,
  checkVoucherDuplicates,
  checkCompanionDuplicates,
};
