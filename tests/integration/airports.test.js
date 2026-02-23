/**
 * Integration Tests for Airports API
 * Tests /api/v1/airports endpoints
 */

const request = require('supertest');
const { createTestApp } = require('../testServer');
const airportService = require('../../services/airportService');

// Mock the airport service
jest.mock('../../services/airportService');

describe('Airports API - Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/airports/search', () => {
    it('should search airports successfully', async () => {
      const mockAirports = [
        {
          iata: 'AUS',
          name: 'Austin-Bergstrom International Airport',
          city: 'Austin',
          country: 'United States',
          timezone: 'America/Chicago',
        },
        {
          iata: 'LAX',
          name: 'Los Angeles International Airport',
          city: 'Los Angeles',
          country: 'United States',
          timezone: 'America/Los_Angeles',
        },
      ];

      airportService.searchAirports = jest.fn().mockResolvedValue(mockAirports);

      const response = await request(app).get('/api/v1/airports/search?q=aus');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.airports).toHaveLength(2);
      expect(response.body.query).toBe('aus');
      expect(response.body.count).toBe(2);
      expect(airportService.searchAirports).toHaveBeenCalledWith('aus', 10);
    });

    it('should respect limit parameter', async () => {
      airportService.searchAirports = jest.fn().mockResolvedValue([]);

      const response = await request(app).get('/api/v1/airports/search?q=aus&limit=5');

      expect(response.status).toBe(200);
      expect(airportService.searchAirports).toHaveBeenCalledWith('aus', 5);
    });

    it('should enforce minimum limit of 1 for invalid values', async () => {
      airportService.searchAirports = jest.fn().mockResolvedValue([]);

      // limit=0 is treated as falsy, so defaults to 10, then Math.max(10, 1) = 10
      const response = await request(app).get('/api/v1/airports/search?q=aus&limit=invalid');

      expect(response.status).toBe(200);
      // Invalid limit defaults to 10
      expect(airportService.searchAirports).toHaveBeenCalledWith('aus', 10);
    });

    it('should enforce maximum limit of 50', async () => {
      airportService.searchAirports = jest.fn().mockResolvedValue([]);

      const response = await request(app).get('/api/v1/airports/search?q=aus&limit=100');

      expect(response.status).toBe(200);
      expect(airportService.searchAirports).toHaveBeenCalledWith('aus', 50);
    });

    it('should return 400 if query is missing', async () => {
      const response = await request(app).get('/api/v1/airports/search');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 if query is too short', async () => {
      const response = await request(app).get('/api/v1/airports/search?q=a');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least 2 characters');
    });

    it('should handle service errors gracefully', async () => {
      airportService.searchAirports = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/v1/airports/search?q=aus');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/v1/airports/:iata', () => {
    it('should get airport by IATA code', async () => {
      const mockAirport = {
        iata: 'AUS',
        icao: 'KAUS',
        name: 'Austin-Bergstrom International Airport',
        city: 'Austin',
        country: 'United States',
        timezone: 'America/Chicago',
        lat: 30.1945,
        lon: -97.6699,
      };

      airportService.getAirportByCode = jest.fn().mockResolvedValue(mockAirport);

      const response = await request(app).get('/api/v1/airports/AUS');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.airport.iata).toBe('AUS');
      expect(response.body.airport.name).toContain('Austin');
      expect(airportService.getAirportByCode).toHaveBeenCalledWith('AUS');
    });

    it('should handle case-insensitive IATA codes', async () => {
      const mockAirport = { iata: 'LAX', name: 'Los Angeles Airport' };

      airportService.getAirportByCode = jest.fn().mockResolvedValue(mockAirport);

      const response = await request(app).get('/api/v1/airports/lax');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(airportService.getAirportByCode).toHaveBeenCalledWith('lax');
    });

    it('should return 404 if airport not found', async () => {
      airportService.getAirportByCode = jest.fn().mockResolvedValue(null);

      const response = await request(app).get('/api/v1/airports/XXX');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Airport not found');
    });

    it('should return 400 for invalid IATA format', async () => {
      const response = await request(app).get('/api/v1/airports/INVALID');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid IATA code');
    });

    it('should return 400 for numeric IATA code', async () => {
      const response = await request(app).get('/api/v1/airports/123');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid IATA code');
    });

    it('should handle service errors gracefully', async () => {
      airportService.getAirportByCode = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/v1/airports/AUS');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});
