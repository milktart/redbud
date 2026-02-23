/**
 * Fix tripId nullable constraint
 * This script updates the database schema to allow tripId to be NULL
 * for standalone items (hotels and car_rentals)
 *
 * Run with: npm run db:sync
 * Or if running directly: node scripts/fix-tripid-nullable.js
 */

const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function fixTripIdNullable() {
  try {
    logger.info('Fixing tripId NOT NULL constraints...');

    // Use alter: true which automatically alters schema to match models
    await sequelize.sync({ alter: true });

    logger.info('Successfully updated database schema');
    logger.info('tripId is now nullable in hotels and car_rentals tables');

    process.exit(0);
  } catch (error) {
    logger.error('Failed to fix tripId constraints', { error: error.message });
    process.exit(1);
  }
}

fixTripIdNullable();
