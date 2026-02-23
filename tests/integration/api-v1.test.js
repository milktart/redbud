/**
 * API v1 Integration Tests
 * Tests for API v1 index routes and key endpoints
 */

const request = require('supertest');
const express = require('express');
const apiV1Routes = require('../../routes/api/v1');
const airportService = require('../../services/airportService');

// Mock services
jest.mock('../../services/airportService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/v1', apiV1Routes);

describe('API v1 Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('should return health check status', async () => {
      const response = await request(app).get('/api/v1/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'API v1 is healthy',
        version: '1.0.0',
      });
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should include valid ISO timestamp', async () => {
      const response = await request(app).get('/api/v1/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('Airport Endpoints', () => {
    describe('GET /api/v1/airports/search', () => {
      it('should search for airports by query', async () => {
        const mockAirports = [
          {
            iata: 'LAX',
            name: 'Los Angeles International Airport',
            city: 'Los Angeles',
            country: 'United States',
          },
          {
            iata: 'LGA',
            name: 'LaGuardia Airport',
            city: 'New York',
            country: 'United States',
          },
        ];

        airportService.searchAirports.mockResolvedValue(mockAirports);

        const response = await request(app).get('/api/v1/airports/search?q=LA').expect(200);

        expect(airportService.searchAirports).toHaveBeenCalledWith('LA', 10);
        expect(response.body).toEqual({
          success: true,
          query: 'LA',
          count: 2,
          airports: mockAirports,
        });
      });

      it('should return 400 if query parameter is missing', async () => {
        const response = await request(app).get('/api/v1/airports/search').expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.any(String),
        });
        expect(airportService.searchAirports).not.toHaveBeenCalled();
      });

      it('should return 400 if query is too short', async () => {
        const response = await request(app).get('/api/v1/airports/search?q=L').expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringMatching(/at least 2 characters/i),
        });
        expect(airportService.searchAirports).not.toHaveBeenCalled();
      });

      it('should handle empty search results', async () => {
        airportService.searchAirports.mockResolvedValue([]);

        const response = await request(app).get('/api/v1/airports/search?q=ZZZZZ').expect(200);

        expect(response.body).toEqual({
          success: true,
          query: 'ZZZZZ',
          count: 0,
          airports: [],
        });
      });

      it('should handle service errors gracefully', async () => {
        airportService.searchAirports.mockRejectedValue(new Error('Database error'));

        const response = await request(app).get('/api/v1/airports/search?q=LAX').expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.any(String),
        });
      });
    });

    describe('GET /api/v1/airports/:iata', () => {
      it('should get airport by IATA code', async () => {
        const mockAirport = {
          iata: 'JFK',
          name: 'John F. Kennedy International Airport',
          city: 'New York',
          country: 'United States',
          timezone: 'America/New_York',
          latitude: 40.6413,
          longitude: -73.7781,
        };

        airportService.getAirportByCode.mockResolvedValue(mockAirport);

        const response = await request(app).get('/api/v1/airports/JFK').expect(200);

        expect(airportService.getAirportByCode).toHaveBeenCalledWith('JFK');
        expect(response.body).toEqual({
          success: true,
          airport: mockAirport,
        });
      });

      it('should return 404 if airport not found', async () => {
        airportService.getAirportByCode.mockResolvedValue(null);

        const response = await request(app).get('/api/v1/airports/ZZZ').expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringMatching(/not found/i),
        });
      });

      it('should handle IATA codes case-insensitively', async () => {
        const mockAirport = {
          iata: 'SFO',
          name: 'San Francisco International Airport',
          city: 'San Francisco',
          country: 'United States',
        };

        airportService.getAirportByCode.mockResolvedValue(mockAirport);

        const response = await request(app).get('/api/v1/airports/sfo').expect(200);

        expect(airportService.getAirportByCode).toHaveBeenCalledWith('sfo');
        expect(response.body).toEqual({
          success: true,
          airport: mockAirport,
        });
      });

      it('should handle service errors gracefully', async () => {
        airportService.getAirportByCode.mockRejectedValue(new Error('Database error'));

        const response = await request(app).get('/api/v1/airports/LAX').expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.any(String),
        });
      });

      it('should validate IATA code format', async () => {
        const response = await request(app).get('/api/v1/airports/TOOLONG').expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringMatching(/3 letters/i),
        });
        expect(airportService.getAirportByCode).not.toHaveBeenCalled();
      });

      it('should accept exactly 3 characters', async () => {
        const mockAirport = { iata: 'ABC', name: 'Test Airport' };
        airportService.getAirportByCode.mockResolvedValue(mockAirport);

        await request(app).get('/api/v1/airports/ABC').expect(200);

        expect(airportService.getAirportByCode).toHaveBeenCalledWith('ABC');
      });
    });
  });

  describe('Route Mounting', () => {
    it('should mount trips routes under /api/v1/trips', async () => {
      // This tests that the trips route is mounted
      // The actual trips endpoints require authentication, so we expect 401 or redirect
      const response = await request(app).get('/api/v1/trips');

      // Should not be 404 - route should exist even if protected
      expect(response.status).not.toBe(404);
    });

    it('should mount airports routes under /api/v1/airports', async () => {
      airportService.searchAirports.mockResolvedValue([]);

      // This should work since airports are public
      const response = await request(app).get('/api/v1/airports/search?q=test');

      expect(response.status).not.toBe(404);
    });

    it('should return 404 for non-existent v1 routes', async () => {
      const response = await request(app).get('/api/v1/nonexistent').expect(404);

      expect(response.status).toBe(404);
    });

    it('should handle trailing slashes consistently', async () => {
      const response1 = await request(app).get('/api/v1/health').expect(200);
      const response2 = await request(app).get('/api/v1/health/').expect(200);

      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return JSON error responses', async () => {
      const response = await request(app).get('/api/v1/airports/search');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(app).get('/api/v1/airports/search?q=').expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('API Versioning', () => {
    it('should include version in health check', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.body.version).toBe('1.0.0');
    });

    it('should be accessible via /api/v1 prefix', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
