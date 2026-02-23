#!/usr/bin/env node

/**
 * Bluebonnet → Redbud Migration Script
 *
 * Imports historical data from a bluebonnet postgres backup (running in a temp
 * Docker container on localhost:5433) into the redbud database.
 *
 * Prerequisites:
 *   docker run -d --name bluebonnet_temp -p 5433:5432 \
 *     -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=prod_travel_planner postgres:15
 *   sleep 5
 *   gunzip -c /home/home/bluebonnet/backups/postgres_full_20260223_065501.sql.gz \
 *     | docker exec -i bluebonnet_temp psql -U postgres -d prod_travel_planner
 *
 * Usage:
 *   node scripts/migrate-from-bluebonnet.js
 *
 * Cleanup:
 *   docker stop bluebonnet_temp && docker rm bluebonnet_temp
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');

// ─── Connection config ────────────────────────────────────────────────────────

const SOURCE_DB = {
  host: process.env.BLUEBONNET_DB_HOST || 'prod_travel_planner_db',
  port: parseInt(process.env.BLUEBONNET_DB_PORT || '5432', 10),
  database: 'prod_travel_planner',
  user: 'postgres',
  password: 'postgres',
};

// TARGET_DB: REDBUD_DB_HOST/PORT take priority to allow overriding when running inside
// a container where 'postgres' may resolve to the wrong host due to network aliases.
const TARGET_DB = {
  host: process.env.REDBUD_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.REDBUD_DB_PORT || process.env.DB_PORT || '5432', 10),
  database: process.env.REDBUD_DB_NAME || process.env.DB_NAME || 'travel_planner',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// ─── UUID map builders ────────────────────────────────────────────────────────

/**
 * Builds a map of bluebonnet user UUIDs → redbud user UUIDs by matching on email.
 */
async function buildUserUuidMap(sourceClient, targetClient) {
  const bbUsers = await sourceClient.query('SELECT id, email FROM users');
  const userMap = {}; // bluebonnet UUID → redbud UUID

  for (const bbUser of bbUsers.rows) {
    const result = await targetClient.query('SELECT id FROM users WHERE email = $1', [bbUser.email]);
    if (result.rows.length > 0) {
      userMap[bbUser.id] = result.rows[0].id;
    } else {
      console.warn(`  WARNING: No redbud user found for email ${bbUser.email} — skipping`);
    }
  }

  console.log(`  Mapped ${Object.keys(userMap).length}/${bbUsers.rows.length} bluebonnet users → redbud UUIDs`);
  return userMap;
}

/**
 * Builds a map of bluebonnet travel_companion UUIDs → redbud user UUIDs.
 * Companions without a matching redbud user are mapped to null (skip).
 */
async function buildCompanionUserMap(sourceClient, targetClient) {
  const companions = await sourceClient.query(
    'SELECT id, email, "userId" FROM travel_companions'
  );
  const companionMap = {}; // companion UUID → redbud user UUID (or null = skip)

  for (const c of companions.rows) {
    if (!c.email) {
      companionMap[c.id] = null;
      continue;
    }
    const result = await targetClient.query('SELECT id FROM users WHERE email = $1', [c.email]);
    if (result.rows.length > 0) {
      companionMap[c.id] = result.rows[0].id;
    } else {
      companionMap[c.id] = null;
      console.warn(`  WARNING: No redbud user found for companion email ${c.email} — will skip`);
    }
  }

  const mapped = Object.values(companionMap).filter((v) => v !== null).length;
  console.log(`  Mapped ${mapped}/${companions.rows.length} travel_companions → redbud user UUIDs`);
  return companionMap;
}

// ─── Migration phases ─────────────────────────────────────────────────────────

async function migrateUsers(sourceClient, targetClient, userMap) {
  console.log('\n[1/9] Updating users...');
  const bbUsers = await sourceClient.query('SELECT * FROM users');
  let updated = 0;

  for (const u of bbUsers.rows) {
    const redbudId = userMap[u.id];
    if (!redbudId) continue;

    await targetClient.query(
      `UPDATE users
         SET password   = $1,
             "isAdmin"  = $2,
             "lastLogin" = $3,
             "isActive" = $4,
             "updatedAt" = NOW()
       WHERE id = $5`,
      [u.password, u.isAdmin, u.lastLogin, u.isActive, redbudId]
    );
    updated++;
  }

  console.log(`  Updated ${updated} users`);
}

async function migrateTrips(sourceClient, targetClient, userMap) {
  console.log('\n[2/9] Migrating trips...');
  const rows = await sourceClient.query('SELECT * FROM trips');
  let inserted = 0;
  let skipped = 0;

  for (const t of rows.rows) {
    const redbudUserId = userMap[t.userId];
    if (!redbudUserId) {
      console.warn(`  SKIP trip ${t.id}: no redbud user for userId ${t.userId}`);
      skipped++;
      continue;
    }

    await targetClient.query(
      `INSERT INTO trips
         (id, "userId", "createdBy", name, "departureDate", "returnDate",
          "defaultCompanionEditPermission", purpose, "isConfirmed", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        t.id,
        redbudUserId,
        redbudUserId,
        t.name,
        t.departureDate,
        t.returnDate,
        t.defaultCompanionEditPermission,
        t.purpose,
        t.isConfirmed,
        t.createdAt,
        t.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} trips, skipped ${skipped}`);
}

async function migrateFlights(sourceClient, targetClient, userMap) {
  console.log('\n[3/9] Migrating flights...');
  const rows = await sourceClient.query('SELECT * FROM flights');
  let inserted = 0;
  let skipped = 0;

  for (const f of rows.rows) {
    const redbudUserId = f.userId ? userMap[f.userId] : null;

    await targetClient.query(
      `INSERT INTO flights
         (id, "userId", "createdBy", "tripId", airline, "flightNumber",
          "departureDateTime", "arrivalDateTime",
          origin, "originTimezone", destination, "destinationTimezone",
          "originLat", "originLng", "destinationLat", "destinationLng",
          pnr, seat, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO NOTHING`,
      [
        f.id,
        redbudUserId,
        redbudUserId,
        f.tripId,
        f.airline,
        f.flightNumber,
        f.departureDateTime,
        f.arrivalDateTime,
        f.origin,
        f.originTimezone,
        f.destination,
        f.destinationTimezone,
        f.originLat,
        f.originLng,
        f.destinationLat,
        f.destinationLng,
        f.pnr,
        f.seat,
        f.createdAt,
        f.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} flights, skipped ${skipped}`);
}

async function migrateHotels(sourceClient, targetClient, userMap, tripOwnerMap) {
  console.log('\n[4/9] Migrating hotels...');
  const rows = await sourceClient.query('SELECT * FROM hotels');
  let inserted = 0;

  for (const h of rows.rows) {
    // Fall back to trip owner when item has no direct userId
    const redbudUserId = h.userId
      ? userMap[h.userId]
      : (h.tripId ? tripOwnerMap[h.tripId] : null);

    await targetClient.query(
      `INSERT INTO hotels
         (id, "userId", "createdBy", "tripId", "hotelName", address, phone,
          "checkInDateTime", "checkOutDateTime",
          lat, lng, "confirmationNumber", "roomNumber",
          "checkInTimezone", "checkOutTimezone",
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [
        h.id,
        redbudUserId,
        redbudUserId,
        h.tripId,
        h.hotelName,
        h.address,
        h.phone,
        h.checkInDateTime,
        h.checkOutDateTime,
        h.lat,
        h.lng,
        h.confirmationNumber,
        h.roomNumber,
        h.checkInTimezone,
        h.checkOutTimezone,
        h.createdAt,
        h.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} hotels`);
}

async function migrateEvents(sourceClient, targetClient, userMap, tripOwnerMap) {
  console.log('\n[5/9] Migrating events...');
  const rows = await sourceClient.query('SELECT * FROM events');
  let inserted = 0;

  for (const e of rows.rows) {
    // Fall back to trip owner when item has no direct userId
    const redbudUserId = e.userId
      ? userMap[e.userId]
      : (e.tripId ? tripOwnerMap[e.tripId] : null);

    await targetClient.query(
      `INSERT INTO events
         (id, "userId", "createdBy", "tripId", name,
          "startDateTime", "endDateTime",
          location, lat, lng,
          "contactPhone", "contactEmail", description, "eventUrl", "isConfirmed",
          "startTimezone", "endTimezone",
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO NOTHING`,
      [
        e.id,
        redbudUserId,
        redbudUserId,
        e.tripId,
        e.name,
        e.startDateTime,
        e.endDateTime,
        e.location,
        e.lat,
        e.lng,
        e.contactPhone,
        e.contactEmail,
        e.description,
        e.eventUrl,
        e.isConfirmed,
        e.startTimezone,
        e.endTimezone,
        e.createdAt,
        e.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} events`);
}

async function migrateTransportation(sourceClient, targetClient, userMap) {
  console.log('\n[6/9] Migrating transportation...');
  const rows = await sourceClient.query('SELECT * FROM transportation');
  let inserted = 0;

  for (const t of rows.rows) {
    const redbudUserId = t.userId ? userMap[t.userId] : null;

    await targetClient.query(
      `INSERT INTO transportation
         (id, "userId", "createdBy", "tripId", method, "journeyNumber",
          origin, "originTimezone", destination, "destinationTimezone",
          "originLat", "originLng", "destinationLat", "destinationLng",
          "departureDateTime", "arrivalDateTime",
          "confirmationNumber", seat,
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO NOTHING`,
      [
        t.id,
        redbudUserId,
        redbudUserId,
        t.tripId,
        t.method,
        t.journeyNumber,
        t.origin,
        t.originTimezone,
        t.destination,
        t.destinationTimezone,
        t.originLat,
        t.originLng,
        t.destinationLat,
        t.destinationLng,
        t.departureDateTime,
        t.arrivalDateTime,
        t.confirmationNumber,
        t.seat,
        t.createdAt,
        t.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} transportation records`);
}

async function migrateCarRentals(sourceClient, targetClient, userMap) {
  console.log('\n[7/9] Migrating car rentals...');
  const rows = await sourceClient.query('SELECT * FROM car_rentals');
  let inserted = 0;

  for (const c of rows.rows) {
    const redbudUserId = c.userId ? userMap[c.userId] : null;

    await targetClient.query(
      `INSERT INTO car_rentals
         (id, "userId", "createdBy", "tripId", company,
          "pickupLocation", "pickupTimezone",
          "dropoffLocation", "dropoffTimezone",
          "pickupLat", "pickupLng", "dropoffLat", "dropoffLng",
          "pickupDateTime", "dropoffDateTime",
          "confirmationNumber",
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO NOTHING`,
      [
        c.id,
        redbudUserId,
        redbudUserId,
        c.tripId,
        c.company,
        c.pickupLocation,
        c.pickupTimezone,
        c.dropoffLocation,
        c.dropoffTimezone,
        c.pickupLat,
        c.pickupLng,
        c.dropoffLat,
        c.dropoffLng,
        c.pickupDateTime,
        c.dropoffDateTime,
        c.confirmationNumber,
        c.createdAt,
        c.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} car rentals`);
}

async function migrateVouchers(sourceClient, targetClient, userMap) {
  console.log('\n[8/9] Migrating vouchers...');
  const rows = await sourceClient.query('SELECT * FROM vouchers');
  let inserted = 0;
  let skipped = 0;

  for (const v of rows.rows) {
    const redbudUserId = v.userId ? userMap[v.userId] : null;

    await targetClient.query(
      `INSERT INTO vouchers
         (id, "userId", type, issuer, "voucherNumber", "associatedAccount",
          "pinCode", currency, "totalValue", "usedAmount",
          status, "expirationDate", "parentVoucherId", notes,
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        v.id,
        redbudUserId,
        v.type,
        v.issuer,
        v.voucherNumber,
        v.associatedAccount,
        v.pinCode,
        v.currency,
        v.totalValue,
        v.usedAmount,
        v.status,
        v.expirationDate,
        v.parentVoucherId,
        v.notes,
        v.createdAt,
        v.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} vouchers, skipped ${skipped}`);
}

async function migrateAttendees(sourceClient, targetClient, userMap, companionMap) {
  console.log('\n[9a/9] Migrating attendees (from item_companions)...');
  const rows = await sourceClient.query('SELECT * FROM item_companions');
  let inserted = 0;
  let skipped = 0;

  for (const ic of rows.rows) {
    const attendeeUserId = companionMap[ic.companionId];
    if (!attendeeUserId) {
      skipped++;
      continue; // companion not mapped to a redbud user → skip
    }

    const addedByUserId = userMap[ic.addedBy];
    if (!addedByUserId) {
      skipped++;
      continue; // addedBy user not in redbud → skip
    }

    const permissionLevel = ic.canEdit ? 'manage' : 'view';

    await targetClient.query(
      `INSERT INTO attendees
         (id, "userId", "itemType", "itemId", "permissionLevel",
          "addedBy", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("userId", "itemType", "itemId") DO NOTHING`,
      [
        ic.id,
        attendeeUserId,
        ic.itemType,
        ic.itemId,
        permissionLevel,
        addedByUserId,
        ic.createdAt,
        ic.updatedAt,
      ]
    );
    inserted++;
  }

  console.log(`  Inserted ${inserted} attendees, skipped ${skipped}`);
}

async function migrateCompanions(sourceClient, targetClient, userMap) {
  console.log('\n[9b/9] Deriving companions from item_companions...');

  // Get distinct (adder → companion email) pairs from item_companions
  const pairs = await sourceClient.query(`
    SELECT DISTINCT ic."addedBy", tc.email AS "companionEmail"
    FROM item_companions ic
    JOIN travel_companions tc ON tc.id = ic."companionId"
  `);

  let inserted = 0;
  let skipped = 0;

  for (const pair of pairs.rows) {
    const adderRedbudId = userMap[pair.addedBy];
    if (!adderRedbudId) {
      skipped++;
      continue;
    }

    const companionResult = await targetClient.query('SELECT id FROM users WHERE email = $1', [
      pair.companionEmail,
    ]);
    if (!companionResult.rows.length) {
      skipped++;
      continue;
    }

    const companionRedbudId = companionResult.rows[0].id;
    if (adderRedbudId === companionRedbudId) {
      skipped++; // self-reference
      continue;
    }

    // adder → companion with 'view'
    const r1 = await targetClient.query(
      `INSERT INTO companions
         (id, "userId", "companionUserId", "permissionLevel", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'view', NOW(), NOW())
       ON CONFLICT ("userId", "companionUserId") DO NOTHING`,
      [adderRedbudId, companionRedbudId]
    );
    if (r1.rowCount > 0) inserted++;

    // companion → adder with 'none' (reciprocal baseline)
    const r2 = await targetClient.query(
      `INSERT INTO companions
         (id, "userId", "companionUserId", "permissionLevel", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'none', NOW(), NOW())
       ON CONFLICT ("userId", "companionUserId") DO NOTHING`,
      [companionRedbudId, adderRedbudId]
    );
    if (r2.rowCount > 0) inserted++;
  }

  console.log(`  Inserted ${inserted} companion records, skipped ${skipped} pairs`);
}

// ─── Verification ─────────────────────────────────────────────────────────────

async function verify(targetClient) {
  console.log('\n─── Verification ─────────────────────────────────────────────');

  const tables = [
    'users',
    'trips',
    'flights',
    'hotels',
    'events',
    'transportation',
    'car_rentals',
    'vouchers',
    'attendees',
    'companions',
  ];

  for (const table of tables) {
    const r = await targetClient.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`  ${table.padEnd(20)} ${r.rows[0].count} rows`);
  }

  // Trips missing createdBy
  const orphanTrips = await targetClient.query(
    'SELECT COUNT(*) FROM trips WHERE "createdBy" IS NULL'
  );
  console.log(`\n  Trips missing createdBy:       ${orphanTrips.rows[0].count} (expect 0)`);

  // Orphaned flight attendees
  const orphanAttendees = await targetClient.query(`
    SELECT COUNT(*) FROM attendees a
    WHERE a."itemType" = 'flight'
      AND NOT EXISTS (SELECT 1 FROM flights f WHERE f.id = a."itemId")
  `);
  console.log(`  Orphaned flight attendees:     ${orphanAttendees.rows[0].count} (expect 0)`);

  // User spot-check
  console.log('\n  Users:');
  const users = await targetClient.query(
    'SELECT email, "isAdmin", "isPhantom" FROM users ORDER BY email'
  );
  for (const u of users.rows) {
    console.log(`    ${u.email.padEnd(30)} isAdmin=${u.isAdmin}  isPhantom=${u.isPhantom}`);
  }

  // Companion relationships
  console.log('\n  Companion relationships:');
  const comps = await targetClient.query(`
    SELECT u1.email AS "from", u2.email AS "to", c."permissionLevel"
    FROM companions c
    JOIN users u1 ON u1.id = c."userId"
    JOIN users u2 ON u2.id = c."companionUserId"
    ORDER BY u1.email, u2.email
  `);
  for (const c of comps.rows) {
    console.log(`    ${c.from.padEnd(30)} → ${c.to.padEnd(30)} [${c.permissionLevel}]`);
  }

  // Sample attendee→flight join
  console.log('\n  Sample attendee→flight (up to 5):');
  const samples = await targetClient.query(`
    SELECT u.email, a."itemType", f."flightNumber", a."permissionLevel"
    FROM attendees a
    JOIN users u ON u.id = a."userId"
    JOIN flights f ON f.id = a."itemId" AND a."itemType" = 'flight'
    ORDER BY f."flightNumber"
    LIMIT 5
  `);
  for (const s of samples.rows) {
    console.log(`    ${s.email.padEnd(30)} ${s.itemType.padEnd(15)} ${s.flightNumber.padEnd(10)} [${s.permissionLevel}]`);
  }

  console.log('\n─────────────────────────────────────────────────────────────');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Bluebonnet → Redbud Migration ===');
  console.log(`Source: ${SOURCE_DB.host}:${SOURCE_DB.port}/${SOURCE_DB.database}`);
  console.log(`Target: ${TARGET_DB.host}:${TARGET_DB.port}/${TARGET_DB.database}`);

  const sourceClient = new Client(SOURCE_DB);
  const targetClient = new Client(TARGET_DB);

  await sourceClient.connect();
  console.log('Connected to source (bluebonnet)');

  await targetClient.connect();
  console.log('Connected to target (redbud)');

  try {
    // Build UUID mapping tables before opening the transaction
    const userMap = await buildUserUuidMap(sourceClient, targetClient);
    const companionMap = await buildCompanionUserMap(sourceClient, targetClient);

    // Build trip → redbud owner map for items that have null userId
    const tripRows = await sourceClient.query('SELECT id, "userId" FROM trips');
    const tripOwnerMap = {}; // bluebonnet tripId → redbud owner UUID
    for (const t of tripRows.rows) {
      if (t.userId && userMap[t.userId]) {
        tripOwnerMap[t.id] = userMap[t.userId];
      }
    }

    await targetClient.query('BEGIN');

    await migrateUsers(sourceClient, targetClient, userMap);
    await migrateTrips(sourceClient, targetClient, userMap);
    await migrateFlights(sourceClient, targetClient, userMap);
    await migrateHotels(sourceClient, targetClient, userMap, tripOwnerMap);
    await migrateEvents(sourceClient, targetClient, userMap, tripOwnerMap);
    await migrateTransportation(sourceClient, targetClient, userMap);
    await migrateCarRentals(sourceClient, targetClient, userMap);
    await migrateVouchers(sourceClient, targetClient, userMap);
    await migrateAttendees(sourceClient, targetClient, userMap, companionMap);
    await migrateCompanions(sourceClient, targetClient, userMap);

    await targetClient.query('COMMIT');
    console.log('\n✓ Migration committed successfully');

    await verify(targetClient);
  } catch (err) {
    await targetClient.query('ROLLBACK');
    console.error('\n✗ Migration FAILED — rolled back:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

main();
