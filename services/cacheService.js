/**
 * Cache Service
 * Provides high-level caching functionality for application data
 * Phase 6 - Performance & Scalability
 */

const redis = require('../utils/redis');
const logger = require('../utils/logger');

// Cache TTL configurations (in seconds)
const TTL = {
  AIRPORTS: 60 * 60 * 24, // 24 hours (static data)
  USER_TRIPS: 60 * 5, // 5 minutes
  TRIP_DETAILS: 60 * 5, // 5 minutes
  USER_COMPANIONS: 60 * 5, // 5 minutes
  USER_VOUCHERS: 60 * 5, // 5 minutes
  TRIP_STATS: 60 * 10, // 10 minutes
  SHORT: 60, // 1 minute
  MEDIUM: 60 * 15, // 15 minutes
  LONG: 60 * 60, // 1 hour
};

/**
 * Generate cache key for airports search
 * @param {string} query - Search query
 * @param {number} limit - Result limit
 * @returns {string}
 */
function airportSearchKey(query, limit) {
  return `airports:search:${query.toLowerCase()}:${limit}`;
}

/**
 * Generate cache key for airport by code
 * @param {string} code - IATA code
 * @returns {string}
 */
function airportCodeKey(code) {
  return `airports:code:${code.toUpperCase()}`;
}

/**
 * Generate cache key for user trips
 * @param {string} userId - User ID
 * @param {string} filter - Filter type (upcoming/past/all)
 * @param {number} page - Page number
 * @returns {string}
 */
function userTripsKey(userId, filter = 'upcoming', page = 1) {
  return `user:${userId}:trips:${filter}:${page}`;
}

/**
 * Generate cache key for trip details
 * @param {string} tripId - Trip ID
 * @returns {string}
 */
function tripDetailsKey(tripId) {
  return `trip:${tripId}:details`;
}

/**
 * Generate cache key for user companions
 * @param {string} userId - User ID
 * @returns {string}
 */
function userCompanionsKey(userId) {
  return `user:${userId}:companions`;
}

/**
 * Generate cache key for user vouchers
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {string}
 */
function userVouchersKey(userId, filters = {}) {
  const filterStr = JSON.stringify(filters);
  return `user:${userId}:vouchers:${Buffer.from(filterStr).toString('base64')}`;
}

/**
 * Generate cache key for trip statistics
 * @param {string} userId - User ID
 * @returns {string}
 */
function tripStatsKey(userId) {
  return `user:${userId}:tripStats`;
}

/**
 * Cache airport search results
 * @param {string} query - Search query
 * @param {number} limit - Result limit
 * @param {Array} airports - Airport results
 * @returns {Promise<boolean>}
 */
async function cacheAirportSearch(query, limit, airports) {
  const key = airportSearchKey(query, limit);
  return redis.set(key, airports, TTL.AIRPORTS);
}

/**
 * Get cached airport search results
 * @param {string} query - Search query
 * @param {number} limit - Result limit
 * @returns {Promise<Array|null>}
 */
async function getCachedAirportSearch(query, limit) {
  const key = airportSearchKey(query, limit);
  return redis.get(key);
}

/**
 * Cache airport by code
 * @param {string} code - IATA code
 * @param {Object} airport - Airport data
 * @returns {Promise<boolean>}
 */
async function cacheAirportByCode(code, airport) {
  const key = airportCodeKey(code);
  return redis.set(key, airport, TTL.AIRPORTS);
}

/**
 * Get cached airport by code
 * @param {string} code - IATA code
 * @returns {Promise<Object|null>}
 */
async function getCachedAirportByCode(code) {
  const key = airportCodeKey(code);
  return redis.get(key);
}

/**
 * Cache user trips
 * @param {string} userId - User ID
 * @param {string} filter - Filter type
 * @param {number} page - Page number
 * @param {Object} data - Trips data
 * @returns {Promise<boolean>}
 */
async function cacheUserTrips(userId, filter, page, data) {
  const key = userTripsKey(userId, filter, page);
  return redis.set(key, data, TTL.USER_TRIPS);
}

/**
 * Get cached user trips
 * @param {string} userId - User ID
 * @param {string} filter - Filter type
 * @param {number} page - Page number
 * @returns {Promise<Object|null>}
 */
async function getCachedUserTrips(userId, filter, page) {
  const key = userTripsKey(userId, filter, page);
  return redis.get(key);
}

/**
 * Invalidate all cached trips for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateUserTrips(userId) {
  const pattern = `user:${userId}:trips:*`;
  const count = await redis.deletePattern(pattern);
  logger.debug('Invalidated user trips cache', { userId, count });
  return count;
}

/**
 * Cache trip details
 * @param {string} tripId - Trip ID
 * @param {Object} trip - Trip data
 * @returns {Promise<boolean>}
 */
async function cacheTripDetails(tripId, trip) {
  const key = tripDetailsKey(tripId);
  return redis.set(key, trip, TTL.TRIP_DETAILS);
}

/**
 * Get cached trip details
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object|null>}
 */
async function getCachedTripDetails(tripId) {
  const key = tripDetailsKey(tripId);
  return redis.get(key);
}

/**
 * Invalidate cached trip details
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>}
 */
async function invalidateTripDetails(tripId) {
  const key = tripDetailsKey(tripId);
  return redis.del(key);
}

/**
 * Cache user companions
 * @param {string} userId - User ID
 * @param {Array} companions - Companions data
 * @returns {Promise<boolean>}
 */
async function cacheUserCompanions(userId, companions) {
  const key = userCompanionsKey(userId);
  return redis.set(key, companions, TTL.USER_COMPANIONS);
}

/**
 * Get cached user companions
 * @param {string} userId - User ID
 * @returns {Promise<Array|null>}
 */
async function getCachedUserCompanions(userId) {
  const key = userCompanionsKey(userId);
  return redis.get(key);
}

/**
 * Invalidate user companions cache
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function invalidateUserCompanions(userId) {
  const key = userCompanionsKey(userId);
  return redis.del(key);
}

/**
 * Cache user vouchers
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @param {Array} vouchers - Vouchers data
 * @returns {Promise<boolean>}
 */
async function cacheUserVouchers(userId, filters, vouchers) {
  const key = userVouchersKey(userId, filters);
  return redis.set(key, vouchers, TTL.USER_VOUCHERS);
}

/**
 * Get cached user vouchers
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Array|null>}
 */
async function getCachedUserVouchers(userId, filters) {
  const key = userVouchersKey(userId, filters);
  return redis.get(key);
}

/**
 * Invalidate all cached vouchers for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function invalidateUserVouchers(userId) {
  const pattern = `user:${userId}:vouchers:*`;
  return redis.deletePattern(pattern);
}

/**
 * Cache trip statistics
 * @param {string} userId - User ID
 * @param {Object} stats - Statistics data
 * @returns {Promise<boolean>}
 */
async function cacheTripStats(userId, stats) {
  const key = tripStatsKey(userId);
  return redis.set(key, stats, TTL.TRIP_STATS);
}

/**
 * Get cached trip statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
async function getCachedTripStats(userId) {
  const key = tripStatsKey(userId);
  return redis.get(key);
}

/**
 * Invalidate trip statistics
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function invalidateTripStats(userId) {
  const key = tripStatsKey(userId);
  return redis.del(key);
}

/**
 * Invalidate all user-related caches
 * Useful when user data changes significantly
 * @param {string} userId - User ID
 * @returns {Promise<number>} Total keys deleted
 */
async function invalidateAllUserCaches(userId) {
  const pattern = `user:${userId}:*`;
  const count = await redis.deletePattern(pattern);
  logger.info('Invalidated all user caches', { userId, count });
  return count;
}

/**
 * Invalidate all airport caches
 * Useful after seeding airport data
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateAirportCaches() {
  const pattern = 'airports:*';
  const count = await redis.deletePattern(pattern);
  logger.info('Invalidated all airport caches', { count });
  return count;
}

module.exports = {
  TTL,
  // Airport caching
  cacheAirportSearch,
  getCachedAirportSearch,
  cacheAirportByCode,
  getCachedAirportByCode,
  invalidateAirportCaches,
  // Trip caching
  cacheUserTrips,
  getCachedUserTrips,
  invalidateUserTrips,
  cacheTripDetails,
  getCachedTripDetails,
  invalidateTripDetails,
  // Companion caching
  cacheUserCompanions,
  getCachedUserCompanions,
  invalidateUserCompanions,
  // Voucher caching
  cacheUserVouchers,
  getCachedUserVouchers,
  invalidateUserVouchers,
  // Statistics caching
  cacheTripStats,
  getCachedTripStats,
  invalidateTripStats,
  // Utility
  invalidateAllUserCaches,
};
