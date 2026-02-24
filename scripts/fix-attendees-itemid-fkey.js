/**
 * Drop the spurious attendees_itemId_fkey foreign key constraint.
 *
 * The attendees table uses a polymorphic itemId that references trips, flights,
 * hotels, transportation, car_rentals, and events. A stale FK constraint
 * pointing only at the trips table was left in the DB, causing inserts for
 * non-trip item attendees to fail with a foreign key violation.
 *
 * Run once: npm run db:fix-attendees-fkey
 */

const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function fixAttendeesItemIdFkey() {
  try {
    logger.info('Dropping spurious attendees_itemId_fkey constraint...');

    await sequelize.query(`
      ALTER TABLE "attendees"
        DROP CONSTRAINT IF EXISTS "attendees_itemId_fkey";
    `);

    logger.info('Done. Item-level attendees (flights, hotels, etc.) can now be saved.');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to drop constraint', { error: error.message });
    process.exit(1);
  }
}

fixAttendeesItemIdFkey();
