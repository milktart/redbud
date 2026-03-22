const axios = require('axios');
const { FlightLookup, Flight } = require('../models');
const DateTimeService = require('./DateTimeService');
const logger = require('../utils/logger');

const BASE_URL = 'https://aerodatabox.p.rapidapi.com/flights/number';
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

class FlightLookupService {
  /**
   * Cache-first lookup. Returns cached result if available, otherwise fetches from API.
   * @param {string} flightIata - e.g. "DL622"
   * @param {string} flightDate - e.g. "2026-04-22"
   * @returns {Object} Formatted flight details
   */
  async lookup(flightIata, flightDate) {
    const cached = await FlightLookup.findOne({ where: { flightIata, flightDate } });
    if (cached) {
      logger.info('FLIGHT_LOOKUP_CACHE_HIT', { flightIata, flightDate });
      return this._formatResponse(cached.dataValues, cached.id);
    }
    return this.refresh(flightIata, flightDate);
  }

  /**
   * Force re-fetch from AeroDataBox, upsert cache, propagate to linked Flight records.
   */
  async refresh(flightIata, flightDate) {
    const row = await this._fetchFromApi(flightIata, flightDate);
    const [record] = await FlightLookup.upsert(row, { returning: true });
    logger.info('FLIGHT_LOOKUP_REFRESHED', { flightIata, flightDate });
    await this._propagateToFlights(record.id, row);
    return this._formatResponse(row, record.id);
  }

  /**
   * Fetch from AeroDataBox via RapidAPI.
   * Returns array of results; picks the one with the highest numeric flight number.
   * URL: GET /flights/number/{flightIata}/{date}?dateLocalRole=Both
   */
  async _fetchFromApi(flightIata, flightDate) {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      const err = new Error('RAPIDAPI_KEY not configured');
      err.statusCode = 500;
      throw err;
    }
    const response = await axios.get(`${BASE_URL}/${encodeURIComponent(flightIata)}/${flightDate}`, {
      params: { dateLocalRole: 'Both' },
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      timeout: 10000,
    });

    const data = response.data;
    if (!Array.isArray(data) || data.length === 0) {
      const err = new Error('Flight not found');
      err.statusCode = 404;
      throw err;
    }

    // Pick highest numeric flight number when multiple results
    const best = data.reduce((prev, curr) => {
      const currNum = parseInt((curr.number ?? '').replace(/\D/g, ''), 10) || 0;
      const prevNum = parseInt((prev.number ?? '').replace(/\D/g, ''), 10) || 0;
      return currNum > prevNum ? curr : prev;
    });

    return this._mapApiToRow(best, flightIata, flightDate);
  }

  /**
   * Update all Flight records linked to this lookup with the latest schedule data.
   */
  async _propagateToFlights(flightLookupId, row) {
    const flights = await Flight.findAll({ where: { flightLookupId } });
    if (flights.length === 0) return;

    for (const flight of flights) {
      const updates = {};

      if (row.depIata) updates.origin = row.depIata;
      if (row.arrIata) updates.destination = row.arrIata;
      if (row.depTimezone) updates.originTimezone = row.depTimezone;
      if (row.arrTimezone) updates.destinationTimezone = row.arrTimezone;

      const depTz = row.depTimezone || flight.originTimezone;
      const arrTz = row.arrTimezone || flight.destinationTimezone;

      if (row.depScheduled && depTz) {
        // depScheduled is stored as local time e.g. "2026-07-14 17:25-06:00"
        const depLocal = row.depScheduled.substring(0, 16).replace(' ', 'T');
        const depUtc = DateTimeService.convertToUTC(depLocal, depTz);
        if (depUtc) updates.departureDateTime = depUtc;
      }

      if (row.arrScheduled && arrTz) {
        const arrLocal = row.arrScheduled.substring(0, 16).replace(' ', 'T');
        const arrUtc = DateTimeService.convertToUTC(arrLocal, arrTz);
        if (arrUtc) updates.arrivalDateTime = arrUtc;
      }

      if (Object.keys(updates).length > 0) {
        await flight.update(updates);
      }
    }

    logger.info('FLIGHT_LOOKUP_PROPAGATED', { flightLookupId, count: flights.length });
  }

  /**
   * Map AeroDataBox response to FlightLookup DB row.
   *
   * AeroDataBox shape:
   * {
   *   number: "DL 2728",
   *   status: "Expected",
   *   departure: {
   *     airport: { iata, icao, name, timeZone, ... },
   *     scheduledTime: { utc: "2026-07-14 23:25Z", local: "2026-07-14 17:25-06:00" },
   *     terminal, gate, ...
   *   },
   *   arrival: { ... same shape ... },
   *   airline: { name, iata, icao },
   *   aircraft: { model },
   * }
   */
  _mapApiToRow(f, flightIata, flightDate) {
    const dep = f.departure ?? {};
    const arr = f.arrival ?? {};
    const depAirport = dep.airport ?? {};
    const arrAirport = arr.airport ?? {};
    const depTime = dep.scheduledTime ?? {};
    const arrTime = arr.scheduledTime ?? {};
    const depEst = dep.predictedTime ?? dep.estimatedTime ?? {};
    const arrEst = arr.predictedTime ?? arr.estimatedTime ?? {};
    const airline = f.airline ?? {};
    const aircraft = f.aircraft ?? {};

    return {
      flightIata,
      flightDate,
      // Departure
      depAirportName: depAirport.name ?? null,
      depIata: depAirport.iata ?? null,
      depIcao: depAirport.icao ?? null,
      depTimezone: depAirport.timeZone ?? null,
      depTerminal: dep.terminal ?? null,
      depGate: dep.gate ?? null,
      depScheduled: depTime.local ?? depTime.utc ?? null,
      depEstimated: depEst.local ?? depEst.utc ?? null,
      depActual: dep.actualTime?.local ?? dep.actualTime?.utc ?? null,
      depDelay: dep.delay ?? null,
      // Arrival
      arrAirportName: arrAirport.name ?? null,
      arrIata: arrAirport.iata ?? null,
      arrIcao: arrAirport.icao ?? null,
      arrTimezone: arrAirport.timeZone ?? null,
      arrTerminal: arr.terminal ?? null,
      arrGate: arr.gate ?? null,
      arrScheduled: arrTime.local ?? arrTime.utc ?? null,
      arrEstimated: arrEst.local ?? arrEst.utc ?? null,
      arrActual: arr.actualTime?.local ?? arr.actualTime?.utc ?? null,
      arrDelay: arr.delay ?? null,
      arrBaggage: arr.baggageBelt ?? null,
      // Airline
      airlineName: airline.name ?? null,
      airlineIata: airline.iata ?? null,
      airlineIcao: airline.icao ?? null,
      // Flight meta
      flightNumber: (f.number ?? '').replace(/\s+/g, ''),
      flightIcao: f.callSign ?? null,
      flightStatus: f.status ?? null,
      // Aircraft (AeroDataBox only gives model name, not codes)
      aircraftRegistration: aircraft.reg ?? null,
      aircraftIata: aircraft.model ?? null,
      aircraftIcao: null,
      // Metadata
      apiLastFetched: new Date(),
    };
  }

  /**
   * Format a DB row into the API response shape consumed by the frontend.
   */
  _formatResponse(row, id) {
    return {
      flightLookupId: id ?? row.id,
      origin: row.depIata ?? '',
      destination: row.arrIata ?? '',
      departureDate: parseDateFromUtcString(row.depScheduled),
      arrivalDate: parseDateFromUtcString(row.arrScheduled),
      departureTime: parseTimeFromUtcString(row.depScheduled),
      arrivalTime: parseTimeFromUtcString(row.arrScheduled),
      departureTimezone: row.depTimezone ?? '',
      arrivalTimezone: row.arrTimezone ?? '',
      depAirportName: row.depAirportName ?? '',
      arrAirportName: row.arrAirportName ?? '',
      depTerminal: row.depTerminal ?? '',
      arrTerminal: row.arrTerminal ?? '',
      depGate: row.depGate ?? '',
      arrGate: row.arrGate ?? '',
      airlineName: row.airlineName ?? '',
      airlineIata: row.airlineIata ?? '',
      flightStatus: row.flightStatus ?? '',
    };
  }
}

/**
 * AeroDataBox UTC strings look like "2026-07-14 23:25Z"
 * Extract the date portion: "2026-07-14"
 */
function parseDateFromUtcString(utcStr) {
  if (!utcStr) return '';
  const m = utcStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * AeroDataBox time strings look like "2026-07-14 17:25-06:00" (local) or "2026-07-14 23:25Z" (UTC)
 * Extract the HH:MM time portion (the first HH:MM after the date, not the timezone offset).
 */
function parseTimeFromUtcString(utcStr) {
  if (!utcStr) return '';
  const m = utcStr.match(/\d{4}-\d{2}-\d{2}[\sT](\d{2}:\d{2})/);
  return m ? m[1] : '';
}

module.exports = FlightLookupService;
