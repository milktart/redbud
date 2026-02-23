/**
 * Unit Tests for services/cacheService.js
 * Tests cache invalidation functionality
 */

/* eslint-env jest */

const cacheService = require('../../../services/cacheService');
const redis = require('../../../utils/redis');

// Mock redis utility
jest.mock('../../../utils/redis', () => ({
  deletePattern: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

describe('CacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('invalidateAirportCaches', () => {
    it('should delete all airport cache keys', async () => {
      redis.deletePattern.mockResolvedValue(5);

      const result = await cacheService.invalidateAirportCaches();

      expect(redis.deletePattern).toHaveBeenCalledWith('airports:*');
      expect(result).toBe(5);
    });

    it('should return 0 if no keys deleted', async () => {
      redis.deletePattern.mockResolvedValue(0);

      const result = await cacheService.invalidateAirportCaches();

      expect(result).toBe(0);
    });

    it('should handle redis errors gracefully', async () => {
      redis.deletePattern.mockRejectedValue(new Error('Redis connection failed'));

      await expect(cacheService.invalidateAirportCaches()).rejects.toThrow(
        'Redis connection failed'
      );
    });

    it('should be called with correct pattern', async () => {
      redis.deletePattern.mockResolvedValue(10);

      await cacheService.invalidateAirportCaches();

      expect(redis.deletePattern).toHaveBeenCalledTimes(1);
      expect(redis.deletePattern).toHaveBeenCalledWith('airports:*');
    });
  });

  describe('cacheAirportSearch', () => {
    it('should cache airport search results', async () => {
      const query = 'LAX';
      const limit = 10;
      const airports = [
        { iata: 'LAX', name: 'Los Angeles International' },
        { iata: 'LGB', name: 'Long Beach Airport' },
      ];

      redis.set.mockResolvedValue(true);

      const result = await cacheService.cacheAirportSearch(query, limit, airports);

      expect(redis.set).toHaveBeenCalledWith(
        'airports:search:lax:10',
        airports,
        cacheService.TTL.AIRPORTS
      );
      expect(result).toBe(true);
    });

    it('should use correct TTL for airport data', async () => {
      const airports = [{ iata: 'JFK' }];
      redis.set.mockResolvedValue(true);

      await cacheService.cacheAirportSearch('jfk', 10, airports);

      expect(redis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        86400 // 24 hours in seconds
      );
    });
  });

  describe('getCachedAirportSearch', () => {
    it('should retrieve cached search results', async () => {
      const cachedData = [{ iata: 'ORD', name: "Chicago O'Hare" }];
      redis.get.mockResolvedValue(cachedData);

      const result = await cacheService.getCachedAirportSearch('ord', 10);

      expect(redis.get).toHaveBeenCalledWith('airports:search:ord:10');
      expect(result).toEqual(cachedData);
    });

    it('should return null for cache miss', async () => {
      redis.get.mockResolvedValue(null);

      const result = await cacheService.getCachedAirportSearch('xyz', 10);

      expect(result).toBeNull();
    });

    it('should normalize query to lowercase in cache key', async () => {
      redis.get.mockResolvedValue(null);

      await cacheService.getCachedAirportSearch('ORD', 10);

      expect(redis.get).toHaveBeenCalledWith('airports:search:ord:10');
    });
  });

  describe('cacheAirportByCode', () => {
    it('should cache airport by IATA code', async () => {
      const airport = {
        iata: 'SFO',
        name: 'San Francisco International',
        city: 'San Francisco',
      };
      redis.set.mockResolvedValue(true);

      const result = await cacheService.cacheAirportByCode('SFO', airport);

      expect(redis.set).toHaveBeenCalledWith(
        'airports:code:SFO',
        airport,
        cacheService.TTL.AIRPORTS
      );
      expect(result).toBe(true);
    });

    it('should uppercase the code in cache key', async () => {
      const airport = { iata: 'sfo' };
      redis.set.mockResolvedValue(true);

      await cacheService.cacheAirportByCode('sfo', airport);

      expect(redis.set).toHaveBeenCalledWith('airports:code:SFO', airport, expect.any(Number));
    });
  });

  describe('getCachedAirportByCode', () => {
    it('should retrieve cached airport by code', async () => {
      const airport = { iata: 'DFW', name: 'Dallas/Fort Worth International' };
      redis.get.mockResolvedValue(airport);

      const result = await cacheService.getCachedAirportByCode('DFW');

      expect(redis.get).toHaveBeenCalledWith('airports:code:DFW');
      expect(result).toEqual(airport);
    });

    it('should uppercase the code for lookup', async () => {
      redis.get.mockResolvedValue(null);

      await cacheService.getCachedAirportByCode('dfw');

      expect(redis.get).toHaveBeenCalledWith('airports:code:DFW');
    });

    it('should return null for cache miss', async () => {
      redis.get.mockResolvedValue(null);

      const result = await cacheService.getCachedAirportByCode('XXX');

      expect(result).toBeNull();
    });
  });

  describe('TTL constants', () => {
    it('should have correct airport TTL', () => {
      expect(cacheService.TTL.AIRPORTS).toBe(86400); // 24 hours
    });

    it('should have defined TTL for all cache types', () => {
      expect(cacheService.TTL.USER_TRIPS).toBeDefined();
      expect(cacheService.TTL.TRIP_DETAILS).toBeDefined();
      expect(cacheService.TTL.USER_COMPANIONS).toBeDefined();
      expect(cacheService.TTL.SHORT).toBeDefined();
      expect(cacheService.TTL.MEDIUM).toBeDefined();
      expect(cacheService.TTL.LONG).toBeDefined();
    });
  });
});
