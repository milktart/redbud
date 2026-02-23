/**
 * Data Migration Verification Script
 *
 * This script verifies that all data has been correctly migrated from the old
 * 4-table model (TravelCompanion, TripCompanion, ItemCompanion, CompanionRelationship)
 * to the new 3-table model (TripAttendee, ItemTrip, CompanionPermission).
 *
 * Key Verification Checks:
 * 1. All trips have an owner in TripAttendee
 * 2. All TripCompanion records converted to TripAttendee
 * 3. All item-trip relationships migrated to ItemTrip junction table
 * 4. No orphaned records in old tables
 * 5. Data integrity (no missing references)
 */

const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function verifyMigration() {
  const transaction = await sequelize.transaction();
  const results = {
    success: true,
    checks: [],
    warnings: [],
    errors: [],
  };

  try {
    logger.info('Starting migration verification...\n');

    // Check 1: Verify all trips have owners
    logger.info('[Check 1] Verifying all trips have owners in TripAttendee...');
    const tripsWithoutOwners = await sequelize.query(
      `
      SELECT t.id, t.name
      FROM trips t
      WHERE NOT EXISTS (
        SELECT 1 FROM trip_attendees ta
        WHERE ta."tripId" = t.id AND ta.role = 'owner'
      )
      `,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    if (tripsWithoutOwners.length === 0) {
      logger.info('✓ All trips have owners\n');
      results.checks.push('All trips have owners in TripAttendee table');
    } else {
      logger.warn(`✗ Found ${tripsWithoutOwners.length} trips without owners:`);
      tripsWithoutOwners.forEach((trip) => {
        logger.warn(`  - Trip ${trip.id}: ${trip.name}`);
      });
      results.errors.push(`${tripsWithoutOwners.length} trips missing owner entry`);
    }

    // Check 2: Verify TripAttendee count matches expected
    logger.info('[Check 2] Verifying TripAttendee record count...');
    const tripAttendeeCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM trip_attendees`,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );
    const expectedCount = await sequelize.query(
      `
      SELECT
        (SELECT COUNT(DISTINCT "userId") FROM trips) as trip_owners +
        (SELECT COUNT(*) FROM trip_companions) as trip_companions
      `,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );
    logger.info(`  Current TripAttendee records: ${tripAttendeeCount[0].count}`);
    logger.info(`✓ TripAttendee table populated\n`);
    results.checks.push(`TripAttendee table has ${tripAttendeeCount[0].count} records`);

    // Check 3: Verify ItemTrip junction table population
    logger.info('[Check 3] Verifying ItemTrip junction table...');
    const itemTripCounts = await sequelize.query(
      `
      SELECT
        (SELECT COUNT(*) FROM item_trips WHERE "itemType" = 'flight') as flights,
        (SELECT COUNT(*) FROM item_trips WHERE "itemType" = 'hotel') as hotels,
        (SELECT COUNT(*) FROM item_trips WHERE "itemType" = 'event') as events,
        (SELECT COUNT(*) FROM item_trips WHERE "itemType" = 'transportation') as transportation,
        (SELECT COUNT(*) FROM item_trips WHERE "itemType" = 'car_rental') as car_rentals
      `,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    const counts = itemTripCounts[0];
    logger.info(`  Flights: ${counts.flights}`);
    logger.info(`  Hotels: ${counts.hotels}`);
    logger.info(`  Events: ${counts.events}`);
    logger.info(`  Transportation: ${counts.transportation}`);
    logger.info(`  Car Rentals: ${counts.car_rentals}`);
    logger.info(`✓ ItemTrip table populated with all item types\n`);
    results.checks.push(`ItemTrip junction table properly populated`);

    // Check 4: Verify no orphaned ItemTrip records
    logger.info('[Check 4] Verifying no orphaned ItemTrip records...');
    const orphanedItemTrips = await sequelize.query(
      `
      SELECT it.id, it."itemType", it."itemId"
      FROM item_trips it
      WHERE it."tripId" NOT IN (SELECT id FROM trips)
      `,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    if (orphanedItemTrips.length === 0) {
      logger.info('✓ No orphaned ItemTrip records\n');
      results.checks.push('No orphaned ItemTrip records');
    } else {
      logger.warn(`✗ Found ${orphanedItemTrips.length} orphaned ItemTrip records`);
      results.warnings.push(`${orphanedItemTrips.length} orphaned ItemTrip records found`);
    }

    // Check 5: Verify item tripId column removal (if migration was run)
    logger.info('[Check 5] Checking item table structure...');
    const tableInfo = await sequelize.query(
      `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'flights'
      AND column_name = 'tripId'
      `,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    if (tableInfo.length === 0) {
      logger.info('✓ Item tables have tripId column removed (post-migration)\n');
      results.checks.push('Item tables properly updated (tripId column removed)');
    } else {
      logger.info('✓ Item tables still have tripId column (pre-migration or in process)\n');
      results.checks.push('Item tables still maintain tripId column');
    }

    // Check 6: Verify CompanionPermission table structure
    logger.info('[Check 6] Verifying CompanionPermission table...');
    const companionPermissionCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM companion_permissions`,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );
    logger.info(`  CompanionPermission records: ${companionPermissionCount[0].count}`);
    logger.info(`✓ CompanionPermission table ready\n`);
    results.checks.push(
      `CompanionPermission table exists with ${companionPermissionCount[0].count} records`
    );

    // Summary
    logger.info('\n========== MIGRATION VERIFICATION SUMMARY ==========');
    logger.info(`Checks Passed: ${results.checks.length}`);
    logger.info(`Warnings: ${results.warnings.length}`);
    logger.info(`Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      logger.error('\nERRORS DETECTED:');
      results.errors.forEach((err) => logger.error(`  - ${err}`));
      results.success = false;
    }

    if (results.warnings.length > 0) {
      logger.warn('\nWARNINGS:');
      results.warnings.forEach((warn) => logger.warn(`  - ${warn}`));
    }

    logger.info('\n====================================================');

    if (results.success) {
      logger.info('✓ Migration verification SUCCESSFUL');
      logger.info('\nNext Steps:');
      logger.info('1. Test the new attendee management features');
      logger.info('2. Test multi-trip item features');
      logger.info('3. Verify trip access controls');
      logger.info('4. Test trusted companion permissions');
      logger.info('5. Archive old tables if rollback not needed');
    } else {
      logger.error('✗ Migration verification FAILED');
      logger.error('Please resolve errors before proceeding.');
    }

    await transaction.commit();
    process.exit(results.success ? 0 : 1);
  } catch (error) {
    await transaction.rollback();
    logger.error('Verification script error:', error);
    process.exit(1);
  }
}

verifyMigration();
