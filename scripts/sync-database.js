/**
 * Database Sync Script
 * Creates all tables from scratch using raw SQL for tables that contain ENUM
 * columns, and sequelize.sync() for the rest.
 *
 * Why raw SQL for ENUM tables?
 * Sequelize's `sync({ alter: true })` generates invalid PostgreSQL when altering
 * a column to an ENUM type — it places the required USING cast inside a COMMENT
 * statement instead of the ALTER COLUMN ... TYPE clause.  There is no supported
 * fix for this in Sequelize; the only clean solution is to own the DDL ourselves
 * for any table that has ENUM columns.
 *
 * For development use only — use migrations in production.
 */

const { sequelize } = require('../models');
const logger = require('../utils/logger');

/**
 * Ensure all ENUM types exist. Safe to call repeatedly — uses IF NOT EXISTS.
 */
async function ensureEnumTypes() {
  const enums = [
    { name: 'enum_companions_permissionLevel', values: ['none', 'view', 'manage_all'] },
    {
      name: 'enum_attendees_itemType',
      values: ['trip', 'flight', 'hotel', 'event', 'transportation', 'car_rental'],
    },
    { name: 'enum_attendees_permissionLevel', values: ['view', 'manage'] },
    {
      name: 'enum_vouchers_type',
      values: [
        'TRAVEL_CREDIT',
        'UPGRADE_CERT',
        'REGIONAL_UPGRADE_CERT',
        'GLOBAL_UPGRADE_CERT',
        'COMPANION_CERT',
        'GIFT_CARD',
        'MISC',
      ],
    },
    {
      name: 'enum_vouchers_status',
      values: ['OPEN', 'PARTIALLY_USED', 'USED', 'EXPIRED', 'TRANSFERRED', 'CANCELLED'],
    },
    {
      name: 'enum_voucher_attachments_itemType',
      values: ['flight', 'hotel', 'event', 'car_rental', 'transportation'],
    },
    { name: 'enum_voucher_attachments_travelerType', values: ['USER', 'COMPANION'] },
    {
      name: 'enum_trips_purpose',
      values: ['business', 'leisure', 'family', 'romantic', 'adventure', 'pleasure', 'other'],
    },
  ];

  for (const e of enums) {
    const values = e.values.map((v) => `'${v}'`).join(', ');
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."${e.name}" AS ENUM(${values});
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

/**
 * Create tables that contain ENUM columns using raw SQL.
 * Uses CREATE TABLE IF NOT EXISTS — safe to run on every startup.
 */
async function createEnumTables() {
  // companions
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "companions" (
      "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
      "userId"           UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "companionUserId"  UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "permissionLevel"  "public"."enum_companions_permissionLevel" NOT NULL DEFAULT 'none',
      "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("id")
    );
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "companions_user_companion_unique"
      ON "companions" ("userId", "companionUserId");
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_companions_companion_user_id"
      ON "companions" ("companionUserId");
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_companions_user_permission"
      ON "companions" ("userId", "permissionLevel");
  `);

  // attendees
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "attendees" (
      "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
      "userId"          UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "itemType"        "public"."enum_attendees_itemType"        NOT NULL,
      "itemId"          UUID        NOT NULL,
      "permissionLevel" "public"."enum_attendees_permissionLevel" NOT NULL DEFAULT 'view',
      "addedBy"         UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("id")
    );
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "attendees_user_item_unique"
      ON "attendees" ("userId", "itemType", "itemId");
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_attendees_item"
      ON "attendees" ("itemType", "itemId");
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_attendees_user_id"
      ON "attendees" ("userId");
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_attendees_added_by"
      ON "attendees" ("addedBy");
  `);

  // vouchers
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "vouchers" (
      "id"                UUID                              NOT NULL DEFAULT gen_random_uuid(),
      "userId"            UUID                              REFERENCES "users"("id"),
      "type"              "public"."enum_vouchers_type"     NOT NULL,
      "issuer"            VARCHAR(255)                      NOT NULL,
      "voucherNumber"     VARCHAR(255)                      NOT NULL UNIQUE,
      "associatedAccount" VARCHAR(255),
      "pinCode"           VARCHAR(255),
      "currency"          VARCHAR(255)                      NOT NULL DEFAULT 'USD',
      "totalValue"        DECIMAL(10,2),
      "usedAmount"        DECIMAL(10,2)                     DEFAULT 0,
      "status"            "public"."enum_vouchers_status"   NOT NULL DEFAULT 'OPEN',
      "expirationDate"    TIMESTAMPTZ,
      "parentVoucherId"   UUID                              REFERENCES "vouchers"("id"),
      "notes"             TEXT,
      "createdAt"         TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
      "updatedAt"         TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("id")
    );
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS "vouchers_user_id" ON "vouchers" ("userId");`);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "vouchers_voucher_number" ON "vouchers" ("voucherNumber");`
  );
  await sequelize.query(`CREATE INDEX IF NOT EXISTS "vouchers_status" ON "vouchers" ("status");`);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "vouchers_expiration_date" ON "vouchers" ("expirationDate");`
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "vouchers_parent_voucher_id" ON "vouchers" ("parentVoucherId");`
  );

  // voucher_attachments
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "voucher_attachments" (
      "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
      "voucherId"        UUID        NOT NULL REFERENCES "vouchers"("id") ON DELETE CASCADE,
      "itemId"           UUID        NOT NULL,
      "itemType"         "public"."enum_voucher_attachments_itemType"     NOT NULL,
      "flightId"         UUID        REFERENCES "flights"("id"),
      "travelerId"       UUID        NOT NULL,
      "travelerType"     "public"."enum_voucher_attachments_travelerType" NOT NULL,
      "attachmentValue"  DECIMAL(10,2),
      "attachmentDate"   TIMESTAMPTZ,
      "notes"            TEXT,
      "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("id")
    );
  `);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "voucher_attachments_voucher_id" ON "voucher_attachments" ("voucherId");`
  );
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "voucher_attachments_flight_id" ON "voucher_attachments" ("flightId");`
  );
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "voucher_attachments_traveler"
      ON "voucher_attachments" ("travelerId", "travelerType");
  `);

  // trips (purpose ENUM)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "trips" (
      "id"                           UUID        NOT NULL DEFAULT gen_random_uuid(),
      "userId"                       UUID        NOT NULL REFERENCES "users"("id"),
      "createdBy"                    UUID        NOT NULL REFERENCES "users"("id"),
      "name"                         VARCHAR(255) NOT NULL,
      "departureDate"                DATE        NOT NULL,
      "returnDate"                   DATE,
      "defaultCompanionEditPermission" BOOLEAN   NOT NULL DEFAULT false,
      "purpose"                      "public"."enum_trips_purpose" NOT NULL DEFAULT 'leisure',
      "isConfirmed"                  BOOLEAN     NOT NULL DEFAULT true,
      "createdAt"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("id")
    );
  `);
}

async function applySchemaPatches() {
  await sequelize.query(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "isPhantom" BOOLEAN NOT NULL DEFAULT false;
  `);
  await sequelize.query(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone" VARCHAR(255) DEFAULT NULL;
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" ("phone")
      WHERE "phone" IS NOT NULL;
  `);
  await sequelize.query(`
    ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
  `);
}

async function syncDatabase() {
  try {
    logger.info('Starting database sync...');

    // Step 1: ensure all ENUM types exist in the public schema
    await ensureEnumTypes();

    // Step 2: create all non-ENUM tables via Sequelize.
    // alter:false means existing tables are never modified — only missing ones are created.
    // This creates users, airports, flights, hotels, etc. which are referenced as
    // foreign keys in the ENUM tables created next.
    await sequelize.sync({ force: false, alter: false });

    // Step 2b: apply schema patches for columns added after initial sync
    await applySchemaPatches();

    // Step 3: create ENUM-bearing tables with correct raw DDL.
    // Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup.
    // These tables are owned here rather than by Sequelize to avoid its broken
    // ENUM ALTER behaviour — Sequelize cannot correctly generate the USING cast
    // required when changing a column type to an ENUM on PostgreSQL.
    await createEnumTables();

    logger.info('Database sync completed successfully');

    process.exit(0);
  } catch (error) {
    logger.error('Database sync failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

syncDatabase();
