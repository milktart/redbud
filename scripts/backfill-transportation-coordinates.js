#!/usr/bin/env node

/**
 * Script: Backfill Transportation Coordinates
 *
 * Geocodes all transportation items that have origin/destination locations
 * but are missing latitude/longitude coordinates, and updates the database.
 *
 * Usage: npm run backfill-transportation-coords
 */

const { Transportation, sequelize } = require('../models');
const geocodingService = require('../services/geocodingService');
const logger = require('../utils/logger');

async function backfillCoordinates() {
  try {
    logger.info('Starting transportation coordinates backfill...');

    // Find all transportation items without complete coordinates
    const itemsNeedingCoords = await Transportation.findAll({
      where: {
        [sequelize.Sequelize.Op.or]: [
          { originLat: null },
          { originLng: null },
          { destinationLat: null },
          { destinationLng: null },
        ],
      },
    });

    logger.info(`Found ${itemsNeedingCoords.length} transportation items missing coordinates`);

    if (itemsNeedingCoords.length === 0) {
      logger.info('All transportation items have coordinates. No backfill needed.');
      process.exit(0);
    }

    let updated = 0;
    let failed = 0;

    // Process each item
    for (const item of itemsNeedingCoords) {
      try {
        logger.info(`Processing: ${item.origin} → ${item.destination}`);

        // Geocode origin and destination
        const originCoords = await geocodingService.geocodeLocation(item.origin);
        const destCoords = await geocodingService.geocodeLocation(item.destination);

        // Update with coordinates if available
        const updateData = {};
        if (originCoords) {
          updateData.originLat = originCoords.lat;
          updateData.originLng = originCoords.lng;
        }
        if (destCoords) {
          updateData.destinationLat = destCoords.lat;
          updateData.destinationLng = destCoords.lng;
        }

        if (Object.keys(updateData).length > 0) {
          await item.update(updateData);
          updated++;
          logger.info(`✓ Updated: ${item.id}`);
        } else {
          failed++;
          logger.warn(`✗ No coordinates found for: ${item.origin} → ${item.destination}`);
        }
      } catch (err) {
        failed++;
        logger.error(`✗ Error processing ${item.id}: ${err.message}`);
      }
    }

    logger.info(`\n=== Backfill Complete ===`);
    logger.info(`Successfully updated: ${updated}/${itemsNeedingCoords.length}`);
    logger.info(`Failed: ${failed}/${itemsNeedingCoords.length}`);

    process.exit(updated > 0 || failed > 0 ? 0 : 1);
  } catch (error) {
    logger.error('Backfill failed:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillCoordinates();
