/**
 * Integration Tests for Trips API
 * Tests /api/v1/trips endpoints
 *
 * Updated for Phase 4: Uses TripBusinessService and TripPresentationService
 */

const request = require('supertest');
const { createTestApp } = require('../testServer');

// Mock the new service trio from Phase 4 refactoring
jest.mock('../../services/business/TripBusinessService');
jest.mock('../../services/presentation/TripPresentationService');

const TripBusinessService = require('../../services/business/TripBusinessService');
const TripPresentationService = require('../../services/presentation/TripPresentationService');

// Mock authentication middleware
jest.mock('../../middleware/auth', () => ({
  ensureAuthenticated: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

describe('Trips API - Integration Tests', () => {
  let app;
  let mockBusinessService;
  let mockPresentationService;
  const mockUserId = 'test-user-123';
  const mockTripId = 'trip-456';

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock instances
    mockBusinessService = {
      getUserTrips: jest.fn(),
      getTripStatistics: jest.fn(),
      searchTrips: jest.fn(),
      getTripWithDetails: jest.fn(),
      createTrip: jest.fn(),
      updateTrip: jest.fn(),
      deleteTrip: jest.fn(),
    };

    mockPresentationService = {
      enrichUserTripsResponse: jest.fn((data) => ({
        ...data,
        ownedTrips: data.ownedTrips.map(t => ({ ...t, canEdit: true, canDelete: true })),
        companionTrips: data.companionTrips || [],
        standalone: data.standalone || {},
        pagination: data.pagination,
      })),
      enrichTrips: jest.fn((trips) => trips.map(t => ({ ...t, canEdit: true }))),
      enrichTrip: jest.fn((trip) => ({ ...trip, canEdit: true, canDelete: true })),
    };

    // Mock the constructor to return our mock instances
    TripBusinessService.mockImplementation(() => mockBusinessService);
    TripPresentationService.mockImplementation(() => mockPresentationService);
  });

  // Helper to create authenticated request
  const authRequest = (method, url) => {
    return request(app)
      [method](url)
      .set('Accept', 'application/json')
      .set('X-Test-User-Id', mockUserId);
  };

  describe('GET /api/v1/trips', () => {
    it('should get all trips for authenticated user', async () => {
      const mockResult = {
        ownedTrips: [
          { id: 'trip-1', name: 'Summer Vacation', userId: mockUserId },
          { id: 'trip-2', name: 'Business Trip', userId: mockUserId },
        ],
        companionTrips: [],
        standalone: { flights: [], events: [] },
        totalCount: 0,
      };

      mockBusinessService.getUserTrips.mockResolvedValue(mockResult);

      const response = await authRequest('get', '/api/v1/trips');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.trips).toHaveLength(2);
      expect(mockBusinessService.getUserTrips).toHaveBeenCalledWith(mockUserId, {
        filter: 'upcoming',
        page: 1,
        limit: 20,
      });
      expect(mockPresentationService.enrichUserTripsResponse).toHaveBeenCalled();
    });

    it('should filter upcoming trips', async () => {
      const mockResult = {
        ownedTrips: [{ id: 'trip-1', name: 'Future Trip' }],
        companionTrips: [],
        standalone: {},
        pagination: { currentPage: 1, totalPages: 1 },
      };

      mockBusinessService.getUserTrips = jest.fn().mockResolvedValue(mockResult);

      const response = await authRequest('get', '/api/v1/trips?filter=upcoming');

      expect(response.status).toBe(200);
      expect(mockBusinessService.getUserTrips).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ filter: 'upcoming' })
      );
    });

    it('should filter past trips with pagination', async () => {
      const mockResult = {
        ownedTrips: [{ id: 'trip-1', name: 'Past Trip' }],
        companionTrips: [],
        standalone: {},
        pagination: { currentPage: 1, totalPages: 3, hasNextPage: true },
      };

      mockBusinessService.getUserTrips = jest.fn().mockResolvedValue(mockResult);

      const response = await authRequest('get', '/api/v1/trips?filter=past&page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
      expect(mockBusinessService.getUserTrips).toHaveBeenCalledWith(mockUserId, {
        filter: 'past',
        page: 1,
        limit: 10,
      });
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app).get('/api/v1/trips');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/trips/stats', () => {
    it('should get trip statistics', async () => {
      const mockStats = {
        totalTrips: 10,
        upcomingTrips: 3,
        pastTrips: 6,
        activeTrips: 1,
      };

      mockBusinessService.getTripStatistics = jest.fn().mockResolvedValue(mockStats);

      const response = await authRequest('get', '/api/v1/trips/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalTrips).toBe(10);
      expect(response.body.data.upcomingTrips).toBe(3);
      expect(mockBusinessService.getTripStatistics).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('GET /api/v1/trips/search', () => {
    it('should search trips by query', async () => {
      const mockTrips = [
        { id: 'trip-1', name: 'Paris Vacation', destination: 'Paris' },
        { id: 'trip-2', name: 'Paris Business', destination: 'Paris' },
      ];

      mockBusinessService.searchTrips = jest.fn().mockResolvedValue(mockTrips);

      const response = await authRequest('get', '/api/v1/trips/search?q=paris');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(mockBusinessService.searchTrips).toHaveBeenCalledWith(mockUserId, 'paris', 10);
    });

    it('should respect limit parameter', async () => {
      mockBusinessService.searchTrips = jest.fn().mockResolvedValue([]);

      const response = await authRequest('get', '/api/v1/trips/search?q=paris&limit=5');

      expect(response.status).toBe(200);
      expect(mockBusinessService.searchTrips).toHaveBeenCalledWith(mockUserId, 'paris', 5);
    });

    it('should return 400 if query is too short', async () => {
      const response = await authRequest('get', '/api/v1/trips/search?q=a');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('at least 2 characters');
    });

    it('should return 400 if query is missing', async () => {
      const response = await authRequest('get', '/api/v1/trips/search');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/trips/:id', () => {
    it('should get trip by ID', async () => {
      const mockTrip = {
        id: mockTripId,
        name: 'Summer Vacation',
        userId: mockUserId,
        flights: [],
        hotels: [],
      };

      mockBusinessService.getTripWithDetails = jest.fn().mockResolvedValue(mockTrip);

      const response = await authRequest('get', `/api/v1/trips/${mockTripId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockTripId);
      expect(response.body.data.name).toBe('Summer Vacation');
      expect(mockBusinessService.getTripWithDetails).toHaveBeenCalledWith(mockTripId, mockUserId);
    });

    it('should return 404 if trip not found', async () => {
      mockBusinessService.getTripWithDetails = jest.fn().mockResolvedValue(null);

      const response = await authRequest('get', '/api/v1/trips/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Trip not found');
    });
  });

  describe('POST /api/v1/trips', () => {
    it('should create a new trip', async () => {
      const newTrip = {
        name: 'New Vacation',
        destination: 'Hawaii',
        departureDate: '2025-07-01',
        returnDate: '2025-07-10',
      };

      const mockCreatedTrip = {
        ...newTrip,
        id: 'new-trip-789',
        userId: mockUserId,
      };

      mockBusinessService.createTrip = jest.fn().mockResolvedValue(mockCreatedTrip);

      const response = await authRequest('post', '/api/v1/trips').send(newTrip);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('new-trip-789');
      expect(response.body.data.name).toBe('New Vacation');
      expect(mockBusinessService.createTrip).toHaveBeenCalledWith(newTrip, mockUserId);
    });

    it('should return 400 if missing required fields', async () => {
      const invalidTrip = {
        name: 'Incomplete Trip',
        // Missing destination and departureDate
      };

      const response = await authRequest('post', '/api/v1/trips').send(invalidTrip);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing required fields');
    });
  });

  describe('PUT /api/v1/trips/:id', () => {
    it('should update a trip', async () => {
      const updatedData = {
        name: 'Updated Trip Name',
        destination: 'New Destination',
      };

      const mockUpdatedTrip = {
        id: mockTripId,
        ...updatedData,
        userId: mockUserId,
      };

      mockBusinessService.updateTrip = jest.fn().mockResolvedValue(mockUpdatedTrip);

      const response = await authRequest('put', `/api/v1/trips/${mockTripId}`).send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Trip Name');
      expect(mockBusinessService.updateTrip).toHaveBeenCalledWith(mockTripId, updatedData, mockUserId);
    });

    it('should return 404 if trip not found', async () => {
      mockBusinessService.updateTrip = jest.fn().mockResolvedValue(null);

      const response = await authRequest('put', '/api/v1/trips/non-existent').send({
        name: 'New Name',
      });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found or access denied');
    });
  });

  describe('DELETE /api/v1/trips/:id', () => {
    it('should delete a trip', async () => {
      mockBusinessService.deleteTrip = jest.fn().mockResolvedValue(true);

      const response = await authRequest('delete', `/api/v1/trips/${mockTripId}`);

      expect(response.status).toBe(204);
      expect(mockBusinessService.deleteTrip).toHaveBeenCalledWith(mockTripId, mockUserId);
    });

    it('should return 404 if trip not found', async () => {
      mockBusinessService.deleteTrip = jest.fn().mockResolvedValue(false);

      const response = await authRequest('delete', '/api/v1/trips/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found or access denied');
    });
  });
});
