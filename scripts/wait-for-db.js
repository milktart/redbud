#!/usr/bin/env node

/**
 * Wait for database to be ready
 * This script attempts to connect to the database with retries
 */

const { sequelize } = require('../models');

const MAX_RETRIES = 30;
const RETRY_DELAY = 2000; // 2 seconds

async function waitForDatabase() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection successful!');
      process.exit(0);
    } catch (error) {
      console.log(`   Attempt ${attempt}/${MAX_RETRIES}: Database not ready - ${error.message}`);

      if (attempt === MAX_RETRIES) {
        console.error('❌ Failed to connect to database after maximum retries');
        process.exit(1);
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

waitForDatabase();
