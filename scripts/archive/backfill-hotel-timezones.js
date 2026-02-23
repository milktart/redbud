/**
 * Backfill missing timezone data for hotels
 *
 * This script finds all hotels without timezone information and infers
 * their timezone from their address using the geocoding API.
 *
 * Usage: node scripts/backfill-hotel-timezones.js
 */

require('dotenv').config();
const { Hotel } = require('../models');
const geocodingService = require('../services/geocodingService');
const logger = require('../utils/logger');

async function backfillHotelTimezones() {
  try {
    logger.info('Starting hotel timezone backfill...');

    // Find all hotels without timezone
    const hotelsWithoutTimezone = await Hotel.findAll({
      where: {
        timezone: [null, ''],
      },
      attributes: ['id', 'hotelName', 'address', 'lat', 'lng'],
    });

    logger.info(`Found ${hotelsWithoutTimezone.length} hotels without timezone`);

    if (hotelsWithoutTimezone.length === 0) {
      logger.info('No hotels to update. All hotels have timezone data.');
      process.exit(0);
    }

    let updated = 0;
    let failed = 0;

    for (const hotel of hotelsWithoutTimezone) {
      try {
        logger.info(`Processing: ${hotel.hotelName} (${hotel.id})`);

        // Try to infer timezone from coordinates if available
        let timezone = null;

        if (hotel.lat && hotel.lng) {
          try {
            timezone = await geocodingService.inferTimezone(hotel.lat, hotel.lng);
            logger.info(`  ✓ Inferred timezone from coordinates: ${timezone}`);
          } catch (error) {
            logger.warn(`  ✗ Failed to infer from coordinates: ${error.message}`);
          }
        }

        // If we still don't have timezone, try from address
        if (!timezone && hotel.address) {
          try {
            const coords = await geocodingService.geocodeLocation(hotel.address);
            if (coords && coords.lat && coords.lng) {
              timezone = await geocodingService.inferTimezone(coords.lat, coords.lng);
              logger.info(`  ✓ Inferred timezone from address: ${timezone}`);
            }
          } catch (error) {
            logger.warn(`  ✗ Failed to infer from address: ${error.message}`);
          }
        }

        // Default to UTC if all else fails
        if (!timezone) {
          timezone = 'UTC';
          logger.warn(`  ⚠ Defaulting to UTC for: ${hotel.hotelName}`);
        }

        // Update the hotel
        await hotel.update({ timezone });
        logger.info(`  ✓ Updated ${hotel.hotelName} with timezone: ${timezone}`);
        updated++;
      } catch (error) {
        logger.error(`  ✗ Error processing ${hotel.hotelName}: ${error.message}`);
        failed++;
      }

      // Rate limiting: add delay between API calls to avoid hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    logger.info('===== BACKFILL COMPLETE =====');
    logger.info(`✓ Updated: ${updated} hotels`);
    logger.info(`✗ Failed: ${failed} hotels`);
    logger.info(`Total processed: ${updated + failed}/${hotelsWithoutTimezone.length}`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error('Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillHotelTimezones();
