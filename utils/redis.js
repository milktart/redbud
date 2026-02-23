/**
 * Redis Client Utility
 * Manages Redis connection and provides caching functionality
 * Phase 6 - Performance & Scalability
 */

const redis = require('redis');
const logger = require('./logger');

// Redis configuration
const redisConfig = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB, 10) || 0,
};

// Only enable Redis in production or if explicitly configured
const isRedisEnabled =
  process.env.NODE_ENV === 'production' || process.env.REDIS_ENABLED === 'true';

let client = null;

/**
 * Initialize Redis client
 * @returns {Promise<Object>} Redis client instance
 */
async function initRedis() {
  if (!isRedisEnabled) {
    logger.info('Redis is disabled (not in production or REDIS_ENABLED not set)');
    return null;
  }

  try {
    client = redis.createClient(redisConfig);

    // Event handlers
    client.on('error', (err) => {
      logger.error('Redis Client Error', { error: err.message });
    });

    client.on('connect', () => {
      logger.info('Redis client connected', {
        host: redisConfig.socket.host,
        port: redisConfig.socket.port,
      });
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    // Connect to Redis
    await client.connect();

    logger.info('Redis initialized successfully');
    return client;
  } catch (error) {
    logger.error('Failed to initialize Redis', { error: error.message });
    logger.warn('Application will continue without Redis caching');
    return null;
  }
}

/**
 * Get Redis client instance
 * @returns {Object|null} Redis client or null if not initialized
 */
function getClient() {
  return client;
}

/**
 * Check if Redis is available
 * @returns {boolean}
 */
function isAvailable() {
  return client !== null && client.isReady;
}

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
async function get(key) {
  if (!isAvailable()) {
    return null;
  }

  try {
    const value = await client.get(key);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    logger.error('Redis GET error', { key, error: error.message });
    return null;
  }
}

/**
 * Set value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
async function set(key, value, ttl = null) {
  if (!isAvailable()) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);

    if (ttl) {
      await client.setEx(key, ttl, serialized);
    } else {
      await client.set(key, serialized);
    }

    return true;
  } catch (error) {
    logger.error('Redis SET error', { key, error: error.message });
    return false;
  }
}

/**
 * Delete key from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function del(key) {
  if (!isAvailable()) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DEL error', { key, error: error.message });
    return false;
  }
}

/**
 * Delete multiple keys matching a pattern
 * @param {string} pattern - Key pattern (e.g., 'user:123:*')
 * @returns {Promise<number>} Number of keys deleted
 */
async function deletePattern(pattern) {
  if (!isAvailable()) {
    return 0;
  }

  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    await client.del(keys);
    return keys.length;
  } catch (error) {
    logger.error('Redis DELETE PATTERN error', { pattern, error: error.message });
    return 0;
  }
}

/**
 * Check if key exists
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
  if (!isAvailable()) {
    return false;
  }

  try {
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis EXISTS error', { key, error: error.message });
    return false;
  }
}

/**
 * Set expiration on key
 * @param {string} key - Cache key
 * @param {number} seconds - Seconds until expiration
 * @returns {Promise<boolean>}
 */
async function expire(key, seconds) {
  if (!isAvailable()) {
    return false;
  }

  try {
    await client.expire(key, seconds);
    return true;
  } catch (error) {
    logger.error('Redis EXPIRE error', { key, seconds, error: error.message });
    return false;
  }
}

/**
 * Increment value (useful for counters)
 * @param {string} key - Cache key
 * @param {number} amount - Amount to increment (default: 1)
 * @returns {Promise<number|null>} New value or null on error
 */
async function incr(key, amount = 1) {
  if (!isAvailable()) {
    return null;
  }

  try {
    if (amount === 1) {
      return await client.incr(key);
    }
    return await client.incrBy(key, amount);
  } catch (error) {
    logger.error('Redis INCR error', { key, amount, error: error.message });
    return null;
  }
}

/**
 * Get or set cached value
 * If key exists, return cached value
 * If not, call fetchFn, cache the result, and return it
 *
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch data if not cached
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<any>}
 */
async function getOrSet(key, fetchFn, ttl = 3600) {
  // Try to get from cache
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch data
  const data = await fetchFn();

  // Cache the result
  if (data !== null && data !== undefined) {
    await set(key, data, ttl);
  }

  return data;
}

/**
 * Flush all keys from current database
 * WARNING: Use with caution!
 * @returns {Promise<boolean>}
 */
async function flushDb() {
  if (!isAvailable()) {
    return false;
  }

  try {
    await client.flushDb();
    logger.warn('Redis database flushed');
    return true;
  } catch (error) {
    logger.error('Redis FLUSHDB error', { error: error.message });
    return false;
  }
}

/**
 * Close Redis connection
 * @returns {Promise<void>}
 */
async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis client disconnected');
  }
}

module.exports = {
  initRedis,
  getClient,
  isAvailable,
  get,
  set,
  del,
  deletePattern,
  exists,
  expire,
  incr,
  getOrSet,
  flushDb,
  disconnect,
};
