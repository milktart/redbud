#!/usr/bin/env node

/**
 * Clear Redis Cache Script
 * Usage: node scripts/clear-cache.js
 */

require('dotenv').config();
const redis = require('../utils/redis');
const logger = require('../utils/logger');

async function clearCache() {
  try {
    logger.info('Connecting to Redis...');
    await redis.initRedis();

    if (!redis.isAvailable()) {
      logger.error('Redis is not available. Check your configuration.');
      logger.info('Make sure REDIS_ENABLED=true is set in your .env file');
      process.exit(1);
    }

    logger.info('Clearing all Redis cache...');
    const success = await redis.flushDb();

    if (success) {
      logger.info('✓ Redis cache cleared successfully');
    } else {
      logger.error('✗ Failed to clear Redis cache');
      process.exit(1);
    }

    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error clearing cache:', { error: error.message });
    process.exit(1);
  }
}

clearCache();
