const axios = require('axios');
const http = require('http');
const https = require('https');
const { version } = require('../package.json');
const logger = require('../utils/logger');
// Configuration
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const GEOCODING_TIMEOUT = parseInt(process.env.GEOCODING_TIMEOUT, 10) || 5000; // Reduced from 10s
const USER_AGENT = `TravelPlannerApp/${version}`;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 100; // ms
const MAX_RETRY_DELAY = 2000; // ms
const FAILURE_CACHE_TTL = 60000; // Cache failures for 1 minute
const SUCCESS_CACHE_TTL = 24 * 60 * 60 * 1000; // Cache successes for 24 hours
const MAX_CONCURRENT_REQUESTS = 2; // Limit concurrent requests to Nominatim
const CIRCUIT_BREAKER_THRESHOLD = 10; // Failed requests before circuit opens
const CIRCUIT_BREAKER_TIMEOUT = 30000; // How long before circuit tries again (30s)
// Connection pooling for HTTP/HTTPS
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 30000,
  freeSocketTimeout: 30000,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 30000,
  freeSocketTimeout: 30000,
});
// Cache with TTL support
const geocodeCache = new Map();
// Circuit breaker state
let circuitState = 'closed'; // 'closed', 'open', 'half-open'
let failureCount = 0;
let lastCircuitOpenTime = 0;
// Request queue management
let concurrentRequests = 0;
/**
 * Check circuit breaker state and potentially reset it
 */
function updateCircuitBreaker() {
  if (circuitState === 'open') {
    const timeSinceOpen = Date.now() - lastCircuitOpenTime;
    if (timeSinceOpen > CIRCUIT_BREAKER_TIMEOUT) {
      logger.info('Circuit breaker transitioning to half-open');
      circuitState = 'half-open';
      failureCount = 0;
    }
  }
}
/**
 * Get cache entry with TTL validation
 */
function getCachedResult(key) {
  if (!geocodeCache.has(key)) {
    return null;
  }
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  // Check if cache entry is still valid
  if (entry.timestamp) {
    const ttl = entry.success ? SUCCESS_CACHE_TTL : FAILURE_CACHE_TTL;
    if (Date.now() - entry.timestamp > ttl) {
      geocodeCache.delete(key);
      return null;
    }
  }
  return entry.data;
}
/**
 * Set cache entry with metadata
 */
function setCacheEntry(key, data, success = true) {
  geocodeCache.set(key, {
    data,
    timestamp: Date.now(),
    success,
  });
}
/**
 * Queue request with concurrency control
 */
async function executeWithConcurrencyControl(fn) {
  // Wait until we can execute
  while (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  concurrentRequests += 1;
  try {
    return await fn();
  } finally {
    concurrentRequests -= 1;
  }
}
/**
 * Retry logic with exponential backoff
 */
async function executeWithRetry(fn, location) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await fn();
      // Reset circuit breaker on success
      if (circuitState !== 'closed') {
        logger.info('Circuit breaker closing after successful request');
        circuitState = 'closed';
        failureCount = 0;
      }
      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      // Log retry
      if (!isLastAttempt) {
        const delay = Math.min(INITIAL_RETRY_DELAY * 2 ** (attempt - 1), MAX_RETRY_DELAY);
        logger.warn(
          `Geocoding retry ${attempt}/${MAX_RETRIES} for "${location}" after ${error.message}, waiting ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Final attempt failed
        logger.error(
          `Geocoding failed after ${MAX_RETRIES} attempts for "${location}":`,
          error.message
        );
        // Update circuit breaker
        failureCount += 1;
        if (failureCount >= CIRCUIT_BREAKER_THRESHOLD && circuitState === 'closed') {
          logger.error(`Circuit breaker opening after ${failureCount} consecutive failures`);
          circuitState = 'open';
          lastCircuitOpenTime = Date.now();
        }
        throw error;
      }
    }
  }
}
/**
 * Geocode a location name to coordinates using Nominatim (OpenStreetMap)
 * @param {string} locationName - The location to geocode
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodeLocation(locationName) {
  if (!locationName || typeof locationName !== 'string') {
    return null;
  }
  const trimmedLocation = locationName.trim();
  if (!trimmedLocation) {
    return null;
  }
  // Check cache first (including expired entries)
  const cached = getCachedResult(trimmedLocation);
  if (cached !== null) {
    return cached;
  }
  // Check circuit breaker
  updateCircuitBreaker();
  if (circuitState === 'open') {
    logger.warn(`Circuit breaker is open, skipping geocoding request for: ${trimmedLocation}`);
    // Cache the null result temporarily to avoid repeated circuit breaker hits
    setCacheEntry(trimmedLocation, null, false);
    return null;
  }
  try {
    let result = null;
    await executeWithConcurrencyControl(async () => {
      result = await executeWithRetry(async () => {
        // Use Nominatim API for geocoding
        const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
          params: {
            format: 'json',
            q: trimmedLocation,
            limit: 1,
          },
          headers: {
            'User-Agent': USER_AGENT,
          },
          timeout: GEOCODING_TIMEOUT,
          httpAgent,
          httpsAgent,
        });
        if (response.data && response.data.length > 0) {
          const geoResult = response.data[0];
          const coords = {
            lat: parseFloat(geoResult.lat),
            lng: parseFloat(geoResult.lon),
          };
          logger.info(`Geocoded ${trimmedLocation} to:`, coords);
          return coords;
        }
        return null;
      }, trimmedLocation);
    });
    // Cache the result
    setCacheEntry(trimmedLocation, result, result !== null);
    return result;
  } catch (error) {
    logger.error(`Geocoding error for "${trimmedLocation}":`, error.message);
    // Cache failure temporarily to reduce repeated API calls
    setCacheEntry(trimmedLocation, null, false);
    return null;
  }
}
/**
 * Clear the geocoding cache
 */
function clearCache() {
  geocodeCache.clear();
  logger.info('Geocoding cache cleared');
}
/**
 * Get cache size
 */
function getCacheSize() {
  return geocodeCache.size;
}
/**
 * Reverse geocode coordinates to get location info including country
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{country_code: string, timezone: string} | null>}
 */
async function reverseGeocode(lat, lng) {
  if (!lat || !lng) {
    return null;
  }
  const cacheKey = `reverse_${lat}_${lng}`;
  const cached = getCachedResult(cacheKey);
  if (cached !== null) {
    return cached;
  }
  // Check circuit breaker
  updateCircuitBreaker();
  if (circuitState === 'open') {
    logger.warn(`Circuit breaker is open, skipping reverse geocoding request for: ${lat}, ${lng}`);
    setCacheEntry(cacheKey, null, false);
    return null;
  }
  try {
    let result = null;
    await executeWithConcurrencyControl(async () => {
      result = await executeWithRetry(async () => {
        // Use Nominatim reverse geocoding
        const response = await axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
          params: {
            format: 'json',
            lat,
            lon: lng,
          },
          headers: {
            'User-Agent': USER_AGENT,
          },
          timeout: GEOCODING_TIMEOUT,
          httpAgent,
          httpsAgent,
        });
        if (response.data && response.data.address) {
          const countryCode = response.data.address.country_code?.toUpperCase();
          const geoResult = {
            country_code: countryCode,
            timezone: getTimezoneForCountry(countryCode, lat, lng),
          };
          logger.info(`Reverse geocoded (${lat}, ${lng}) to country: ${countryCode}`);
          return geoResult;
        }
        return null;
      }, `${lat},${lng}`);
    });
    setCacheEntry(cacheKey, result, result !== null);
    return result;
  } catch (error) {
    logger.error(`Reverse geocoding error for (${lat}, ${lng}):`, error.message);
    setCacheEntry(cacheKey, null, false);
    return null;
  }
}
/**
 * Infer timezone from latitude/longitude
 * Uses reverse geocoding to get country, then looks up timezone
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} - IANA timezone string or null
 */
async function inferTimezone(lat, lng) {
  if (!lat || !lng) {
    return null;
  }
  try {
    const geoData = await reverseGeocode(lat, lng);
    return geoData?.timezone || null;
  } catch (error) {
    logger.error('Error inferring timezone:', error);
    return null;
  }
}
/**
 * Map country code to timezone
 * For US, uses latitude/longitude to determine the correct timezone
 * @param {string} countryCode - Two-letter country code (e.g., 'US', 'GB')
 * @param {number} lat - Latitude (required for US timezone determination)
 * @param {number} lng - Longitude (required for US timezone determination)
 * @returns {string} - IANA timezone string
 */
function getTimezoneForCountry(countryCode, lat, lng) {
  // Special handling for US - determine timezone based on longitude
  if (countryCode === 'US' && lng !== undefined) {
    return getUSTimezone(lat, lng);
  }
  // Country code to primary timezone mapping
  const countryTimezones = {
    // Americas (non-US)
    CA: 'America/Toronto',
    MX: 'America/Mexico_City',
    BR: 'America/Sao_Paulo',
    AR: 'America/Argentina/Buenos_Aires',
    CL: 'America/Santiago',
    CO: 'America/Bogota',
    PE: 'America/Lima',
    // Europe
    GB: 'Europe/London',
    IE: 'Europe/Dublin',
    FR: 'Europe/Paris',
    DE: 'Europe/Berlin',
    IT: 'Europe/Rome',
    ES: 'Europe/Madrid',
    NL: 'Europe/Amsterdam',
    BE: 'Europe/Brussels',
    CH: 'Europe/Zurich',
    AT: 'Europe/Vienna',
    SE: 'Europe/Stockholm',
    NO: 'Europe/Oslo',
    DK: 'Europe/Copenhagen',
    FI: 'Europe/Helsinki',
    PL: 'Europe/Warsaw',
    CZ: 'Europe/Prague',
    RU: 'Europe/Moscow',
    // Asia
    JP: 'Asia/Tokyo',
    CN: 'Asia/Shanghai',
    IN: 'Asia/Kolkata',
    SG: 'Asia/Singapore',
    TH: 'Asia/Bangkok',
    MY: 'Asia/Kuala_Lumpur',
    PH: 'Asia/Manila',
    KR: 'Asia/Seoul',
    ID: 'Asia/Jakarta',
    VN: 'Asia/Ho_Chi_Minh',
    HK: 'Asia/Hong_Kong',
    // Middle East
    AE: 'Asia/Dubai',
    SA: 'Asia/Riyadh',
    IL: 'Asia/Jerusalem',
    TR: 'Europe/Istanbul',
    // Africa
    ZA: 'Africa/Johannesburg',
    EG: 'Africa/Cairo',
    NG: 'Africa/Lagos',
    KE: 'Africa/Nairobi',
    // Oceania
    AU: 'Australia/Sydney',
    NZ: 'Pacific/Auckland',
  };
  if (countryCode && countryTimezones[countryCode]) {
    return countryTimezones[countryCode];
  }
  // Fallback: estimate timezone from longitude
  if (lng !== undefined) {
    const estimatedOffset = Math.round(lng / 15);
    if (estimatedOffset >= -12 && estimatedOffset <= 12) {
      const hours = Math.abs(estimatedOffset);
      const sign = estimatedOffset >= 0 ? '+' : '-';
      return `UTC${sign}${hours}`;
    }
  }
  return 'UTC';
}
/**
 * Determine US timezone based on latitude and longitude
 * Uses longitude to determine which US timezone zone the coordinate falls into
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} - IANA timezone string
 */
function getUSTimezone(lat, lng) {
  let timezone = null;
  // Handle special cases: Alaska and Hawaii
  if (lat < 30 && lng < -150) {
    // Hawaii (roughly south of 30°N and west of 150°W)
    timezone = 'Pacific/Honolulu';
  } else if (lat > 50 && lng < -130) {
    // Alaska (roughly north of 50°N and west of 130°W)
    timezone = 'America/Anchorage';
  } else if (lng > -85) {
    // Continental US timezones based on longitude
    // Longitude ranges (approximate):
    // Eastern: > -85°
    // Central: -90° to -85°
    // Mountain: -105° to -90°
    // Pacific: -125° to -105°
    // Eastern Time
    timezone = 'America/New_York';
  } else if (lng > -90) {
    // Central Time
    timezone = 'America/Chicago';
  } else if (lng > -105) {
    // Mountain Time
    timezone = 'America/Denver';
  } else {
    // Pacific Time (and anything further west in continental US)
    timezone = 'America/Los_Angeles';
  }
  // Log the timezone inference for debugging
  logger.info(`US timezone inference: (${lat}, ${lng}) -> ${timezone}`);
  return timezone;
}
/**
 * Get diagnostic information about the geocoding service
 */
function getDiagnostics() {
  return {
    circuitState,
    failureCount,
    concurrentRequests,
    cacheSize: geocodeCache.size,
    timeout: GEOCODING_TIMEOUT,
    maxRetries: MAX_RETRIES,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    circuitBreakerThreshold: CIRCUIT_BREAKER_THRESHOLD,
  };
}
module.exports = {
  geocodeLocation,
  reverseGeocode,
  inferTimezone,
  getTimezoneForCountry,
  clearCache,
  getCacheSize,
  getDiagnostics,
};
