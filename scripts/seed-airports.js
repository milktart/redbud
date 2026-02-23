#!/usr/bin/env node

/**
 * Airport Data Seeder
 * Migrates airport data from data/airports.json to the airports table
 * Phase 2 - Database Improvements
 */

const fs = require('fs');
const path = require('path');
const { Airport, sequelize } = require('../models');
const logger = require('../utils/logger');
const redis = require('../utils/redis');
const cacheService = require('../services/cacheService');

async function seedAirports() {
  try {
    logger.info('Starting airport data migration...');

    // Read airports.json
    const airportsPath = path.join(__dirname, '../data/airports.json');
    const airportsData = JSON.parse(fs.readFileSync(airportsPath, 'utf8'));

    const airportCount = Object.keys(airportsData).length;
    logger.info(`Found ${airportCount} airports in JSON file`);

    // Prepare bulk insert data
    const airportsToInsert = [];
    let skipped = 0;

    for (const [iata, data] of Object.entries(airportsData)) {
      // Skip if required fields are missing
      if (!data.airport_name || !data.city_name || !data.country_name) {
        skipped += 1;
        continue;
      }

      airportsToInsert.push({
        iata: iata.toUpperCase(),
        icao: null, // Not available in JSON data
        name: data.airport_name,
        city: data.city_name,
        country: data.country_name,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        timezone: data.timezone || null,
      });
    }

    logger.info(`Prepared ${airportsToInsert.length} airports for insertion`);
    if (skipped > 0) {
      logger.warn(`Skipped ${skipped} airports due to missing required fields`);
    }

    // Use transaction for atomic operation
    await sequelize.transaction(async (t) => {
      // Clear existing data
      const deleted = await Airport.destroy({ where: {}, transaction: t });
      logger.info(`Deleted ${deleted} existing airport records`);

      // Bulk insert new data (in batches to avoid memory issues)
      const batchSize = 1000;
      let inserted = 0;

      for (let i = 0; i < airportsToInsert.length; i += batchSize) {
        const batch = airportsToInsert.slice(i, i + batchSize);
        await Airport.bulkCreate(batch, {
          transaction: t,
          ignoreDuplicates: true, // Skip duplicates
        });
        inserted += batch.length;

        if (inserted % 5000 === 0 || inserted === airportsToInsert.length) {
          logger.info(`Inserted ${inserted}/${airportsToInsert.length} airports...`);
        }
      }

      logger.info(`Successfully inserted ${inserted} airports`);
    });

    // Verify final count
    const finalCount = await Airport.count();
    logger.info(`Database now contains ${finalCount} airports`);

    // Clear airport cache if Redis is available
    try {
      await redis.initRedis();
      if (redis.isAvailable()) {
        const cacheCleared = await cacheService.invalidateAirportCaches();
        logger.info(`Cleared ${cacheCleared} cached airport entries`);
      } else {
        logger.info('Redis not available, skipping cache invalidation');
      }
    } catch (cacheError) {
      logger.warn('Failed to clear airport cache (non-critical):', cacheError.message);
    }

    logger.info('✓ Airport data migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Airport migration failed:', error);
    process.exit(1);
  }
}

// Run the seeder
seedAirports();
