/**
 * Cleanup Script: Remove duplicate companions by email
 *
 * Since email is now globally unique, this script removes duplicate companions,
 * keeping the oldest entry for each email address.
 *
 * Usage: node scripts/cleanup-duplicate-companions.js
 */

require('dotenv').config();
const { Op } = require('sequelize');
const db = require('../models');
const logger = require('../utils/logger');

async function cleanupDuplicates() {
  try {
    logger.info('Starting duplicate companion cleanup...');

    // Get all companions ordered by email and creation date
    const companions = await db.TravelCompanion.findAll({
      order: [
        ['email', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });

    if (companions.length === 0) {
      logger.info('No companions found');
      return;
    }

    // Group by email and identify duplicates
    const emailMap = {};
    const idsToDelete = [];

    companions.forEach((companion) => {
      const email = companion.email.toLowerCase();
      if (!emailMap[email]) {
        emailMap[email] = [];
      }
      emailMap[email].push({
        id: companion.id,
        name: companion.name,
        email: companion.email,
        createdAt: companion.createdAt,
        createdBy: companion.createdBy,
      });
    });

    // Find duplicates
    let duplicateCount = 0;
    Object.entries(emailMap).forEach(([email, records]) => {
      if (records.length > 1) {
        duplicateCount += records.length - 1;
        logger.info(`Found ${records.length} companions with email ${email}`, {
          records: records.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })),
        });

        // Keep the first one (oldest), delete the rest
        records.slice(1).forEach((record) => {
          idsToDelete.push(record.id);
        });
      }
    });

    if (idsToDelete.length === 0) {
      logger.info('No duplicate companions found');
      return;
    }

    logger.info(`Found ${duplicateCount} duplicate companion records to delete`, { idsToDelete });

    // Delete related trip_companions records first
    const deletedTripCompanions = await db.TripCompanion.destroy({
      where: { companionId: { [Op.in]: idsToDelete } },
    });
    logger.info(`Deleted ${deletedTripCompanions} trip_companions records`);

    // Delete related item_companions records
    const deletedItemCompanions = await db.ItemCompanion.destroy({
      where: { companionId: { [Op.in]: idsToDelete } },
    });
    logger.info(`Deleted ${deletedItemCompanions} item_companions records`);

    // Delete the duplicate companions
    const deletedCompanions = await db.TravelCompanion.destroy({
      where: { id: { [Op.in]: idsToDelete } },
    });
    logger.info(`Deleted ${deletedCompanions} duplicate companion records`);

    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error('Error during cleanup:', error);
    throw error;
  } finally {
    await db.sequelize.close();
  }
}

cleanupDuplicates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    process.exit(1);
  });
