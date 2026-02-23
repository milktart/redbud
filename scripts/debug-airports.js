#!/usr/bin/env node

/**
 * Airport Debugging Script
 * Checks airport database status and tests search functionality
 */

const { Airport } = require('../models');
const airportService = require('../services/airportService');

async function debugAirports() {
  try {
    // 1. Check database connection
    const count = await Airport.count();

    if (count === 0) {
      process.exit(1);
    }

    // 2. Test direct database query
    const sampleAirport = await Airport.findOne({ where: { iata: 'LAX' } });

    // 3. Test airportService.searchAirports()
    const searchResults = await airportService.searchAirports('LAX', 5);

    // 4. Test airportService.getAirportByCode()
    const jfk = await airportService.getAirportByCode('JFK');

    // 5. Test search endpoint response format
    const results = searchResults.map((airport) => ({
      iata: airport.iata,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      timezone: airport.timezone,
      label: `${airport.iata} - ${airport.city}, ${airport.country}`,
      value: airport.iata,
    }));

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

debugAirports();
