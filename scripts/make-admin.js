#!/usr/bin/env node

/**
 * Make a user an admin
 * Usage: node scripts/make-admin.js user@example.com
 */

require('dotenv').config();
const db = require('../models');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/make-admin.js user@example.com');
  process.exit(1);
}

async function makeAdmin() {
  try {
    // Initialize database
    await db.sequelize.authenticate();
    console.log('Connected to database');

    // Find user
    const user = await db.User.findOne({ where: { email } });

    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    // Update user
    user.isAdmin = true;
    await user.save();

    console.log(`✓ User ${email} is now an admin`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

makeAdmin();
