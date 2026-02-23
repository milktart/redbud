/**
 * Integration Tests for Unified Item API
 * Tests /api/v1/item endpoints for all item types
 */

const request = require('supertest');
const { createTestApp } = require('../testServer');
const { Flight, Hotel, Transportation, Event, CarRental, Trip } = require('../../models');

// Mock authentication middleware
jest.mock('../../middleware/auth', () => ({
  ensureAuthenticated: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  },
}));

// Mock services
jest.mock('../../services/FlightService');
jest.mock('../../services/HotelService');
jest.mock('../../services/TransportationService');
jest.mock('../../services/EventService');
jest.mock('../../services/CarRentalService');
jest.mock('../../services/presentation/ItemPresentationService');

const FlightService = require('../../services/FlightService');
const HotelService = require('../../services/HotelService');
const TransportationService = require('../../services/TransportationService');
const EventService = require('../../services/EventService');
const CarRentalService = require('../../services/CarRentalService');
const ItemPresentationService = require('../../services/presentation/ItemPresentationService');

describe('Unified Item API - Integration Tests', () => {
  let app;
  const mockUserId = 'test-user-123';
  const mockTripId = 'test-trip-456';

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Trip.findByPk for trip validation
    Trip.findByPk = jest.fn((id) => {
      if (id === mockTripId) {
        return Promise.resolve({ id: mockTripId, userId: mockUserId });
      }
      return Promise.resolve(null);
    });

    // Mock presentation service
    ItemPresentationService.prototype.enrichItem = jest.fn((item) => ({
      ...item,
      canEdit: true,
      canDelete: true,
      isOwner: true,
    }));

    // Mock Flight service
    FlightService.prototype.prepareFlightData = jest.fn((data) =>
      Promise.resolve({
        ...data,
        departureDateTime: '2024-01-01T10:00:00Z',
        arrivalDateTime: '2024-01-01T14:00:00Z',
      })
    );
    FlightService.prototype.createItem = jest.fn((data, userId) =>
      Promise.resolve({
        id: 'flight-123',
        userId,
        ...data,
        toJSON: () => ({
          id: 'flight-123',
          userId,
          ...data,
        }),
      })
    );
    FlightService.prototype.updateItem = jest.fn((item, data, userId) =>
      Promise.resolve({
        ...item,
        ...data,
        toJSON: () => ({ ...item, ...data }),
      })
    );
    FlightService.prototype.deleteItem = jest.fn();

    // Mock Hotel service
    HotelService.prototype.prepareHotelData = jest.fn((data) =>
      Promise.resolve({
        ...data,
        checkInDateTime: '2024-01-01T15:00:00Z',
        checkOutDateTime: '2024-01-03T11:00:00Z',
      })
    );
    HotelService.prototype.createItem = jest.fn((data, userId) =>
      Promise.resolve({
        id: 'hotel-123',
        userId,
        ...data,
        toJSON: () => ({
          id: 'hotel-123',
          userId,
          ...data,
        }),
      })
    );
    HotelService.prototype.updateItem = jest.fn((item, data, userId) =>
      Promise.resolve({
        ...item,
        ...data,
        toJSON: () => ({ ...item, ...data }),
      })
    );
    HotelService.prototype.deleteItem = jest.fn();

    // Mock Transportation service
    TransportationService.prototype.prepareTransportationData = jest.fn((data) =>
      Promise.resolve({
        ...data,
        pickupDateTime: '2024-01-01T08:00:00Z',
        dropoffDateTime: '2024-01-01T09:00:00Z',
      })
    );
    TransportationService.prototype.createItem = jest.fn((data, userId) =>
      Promise.resolve({
        id: 'transportation-123',
        userId,
        ...data,
        toJSON: () => ({
          id: 'transportation-123',
          userId,
          ...data,
        }),
      })
    );

    // Mock Event service
    EventService.prototype.prepareEventData = jest.fn((data) =>
      Promise.resolve({
        ...data,
        startDateTime: '2024-01-01T18:00:00Z',
      })
    );
    EventService.prototype.createItem = jest.fn((data, userId) =>
      Promise.resolve({
        id: 'event-123',
        userId,
        ...data,
        toJSON: () => ({
          id: 'event-123',
          userId,
          ...data,
        }),
      })
    );

    // Mock CarRental service
    CarRentalService.prototype.prepareCarRentalData = jest.fn((data) =>
      Promise.resolve({
        ...data,
        pickupDateTime: '2024-01-01T09:00:00Z',
        dropoffDateTime: '2024-01-03T09:00:00Z',
      })
    );
    CarRentalService.prototype.createItem = jest.fn((data, userId) =>
      Promise.resolve({
        id: 'car-rental-123',
        userId,
        ...data,
        toJSON: () => ({
          id: 'car-rental-123',
          userId,
          ...data,
        }),
      })
    );
  });

  // Helper to create authenticated request
  const authRequest = (method, url) => {
    return request(app)
      [method](url)
      .set('Accept', 'application/json')
      .set('X-Test-User-Id', mockUserId);
  };

  describe('POST /api/v1/item', () => {
    it('should create a flight', async () => {
      const flightData = {
        itemType: 'flight',
        tripId: mockTripId,
        flightNumber: 'AA100',
        origin: 'JFK',
        destination: 'LAX',
        departureDate: '2024-01-01',
        departureTime: '10:00',
        arrivalDate: '2024-01-01',
        arrivalTime: '14:00',
      };

      const response = await authRequest('post', '/api/v1/item').send(flightData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemType).toBe('flight');
      expect(response.body.data.id).toBe('flight-123');
      expect(FlightService.prototype.createItem).toHaveBeenCalled();
    });

    it('should create a hotel', async () => {
      const hotelData = {
        itemType: 'hotel',
        tripId: mockTripId,
        hotelName: 'Hilton Downtown',
        address: '123 Main St, New York, NY',
        checkInDate: '2024-01-01',
        checkOutDate: '2024-01-03',
      };

      const response = await authRequest('post', '/api/v1/item').send(hotelData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemType).toBe('hotel');
      expect(response.body.data.id).toBe('hotel-123');
      expect(HotelService.prototype.createItem).toHaveBeenCalled();
    });

    it('should create transportation', async () => {
      const transportationData = {
        itemType: 'transportation',
        tripId: mockTripId,
        method: 'Taxi',
        origin: 'JFK Airport',
        destination: 'Hotel',
        departureDate: '2024-01-01',
        arrivalDate: '2024-01-01',
      };

      const response = await authRequest('post', '/api/v1/item').send(transportationData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemType).toBe('transportation');
      expect(TransportationService.prototype.createItem).toHaveBeenCalled();
    });

    it('should create an event', async () => {
      const eventData = {
        itemType: 'event',
        tripId: mockTripId,
        name: 'Conference',
        location: 'Convention Center',
        startDate: '2024-01-02',
        startTime: '09:00',
      };

      const response = await authRequest('post', '/api/v1/item').send(eventData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemType).toBe('event');
      expect(EventService.prototype.createItem).toHaveBeenCalled();
    });

    it('should create a car rental', async () => {
      const carRentalData = {
        itemType: 'car_rental',
        tripId: mockTripId,
        company: 'Hertz',
        pickupLocation: 'LAX Airport',
        dropoffLocation: 'LAX Airport',
        pickupDate: '2024-01-01',
        dropoffDate: '2024-01-03',
      };

      const response = await authRequest('post', '/api/v1/item').send(carRentalData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemType).toBe('car_rental');
      expect(CarRentalService.prototype.createItem).toHaveBeenCalled();
    });

    it('should reject invalid itemType', async () => {
      const invalidData = {
        itemType: 'invalid',
        name: 'Test',
      };

      const response = await authRequest('post', '/api/v1/item').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid itemType');
    });

    it('should reject missing itemType', async () => {
      const invalidData = {
        name: 'Test',
      };

      const response = await authRequest('post', '/api/v1/item').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('itemType is required');
    });

    it('should validate trip access', async () => {
      const flightData = {
        itemType: 'flight',
        tripId: 'unauthorized-trip',
        flightNumber: 'AA100',
        origin: 'JFK',
        destination: 'LAX',
      };

      const response = await authRequest('post', '/api/v1/item').send(flightData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('GET /api/v1/item', () => {
    beforeEach(() => {
      // Mock findAll for each model
      Flight.findAll = jest.fn(() =>
        Promise.resolve([
          { id: 'flight-1', userId: mockUserId, flightNumber: 'AA100', toJSON: function () { return { ...this }; } },
          { id: 'flight-2', userId: mockUserId, flightNumber: 'UA200', toJSON: function () { return { ...this }; } },
        ])
      );
      Hotel.findAll = jest.fn(() =>
        Promise.resolve([
          { id: 'hotel-1', userId: mockUserId, hotelName: 'Hilton', toJSON: function () { return { ...this }; } },
        ])
      );
      Transportation.findAll = jest.fn(() => Promise.resolve([]));
      Event.findAll = jest.fn(() => Promise.resolve([]));
      CarRental.findAll = jest.fn(() => Promise.resolve([]));
    });

    it('should list all items', async () => {
      const response = await authRequest('get', '/api/v1/item');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3); // 2 flights + 1 hotel
      expect(response.body.message).toContain('Retrieved 3 items');
    });

    it('should filter by type', async () => {
      const response = await authRequest('get', '/api/v1/item?type=flight');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((item) => item.itemType === 'flight')).toBe(true);
    });

    it('should filter by tripId', async () => {
      const response = await authRequest('get', '/api/v1/item?tripId=' + mockTripId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Flight.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tripId: mockTripId }),
        })
      );
    });

    it('should filter by both type and tripId', async () => {
      const response = await authRequest('get', '/api/v1/item?type=hotel&tripId=' + mockTripId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Hotel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            tripId: mockTripId,
          }),
        })
      );
    });

    it('should reject invalid type filter', async () => {
      const response = await authRequest('get', '/api/v1/item?type=invalid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid type');
    });
  });

  describe('GET /api/v1/item/:id', () => {
    it('should get a flight by id', async () => {
      Flight.findByPk = jest.fn(() =>
        Promise.resolve({
          id: 'flight-123',
          userId: mockUserId,
          flightNumber: 'AA100',
          toJSON: function () { return { ...this }; },
        })
      );

      const response = await authRequest('get', '/api/v1/item/flight-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('flight-123');
      expect(response.body.data.itemType).toBe('flight');
    });

    it('should get a hotel by id', async () => {
      Flight.findByPk = jest.fn(() => Promise.resolve(null));
      Hotel.findByPk = jest.fn(() =>
        Promise.resolve({
          id: 'hotel-123',
          userId: mockUserId,
          hotelName: 'Hilton',
          toJSON: function () { return { ...this }; },
        })
      );

      const response = await authRequest('get', '/api/v1/item/hotel-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('hotel-123');
      expect(response.body.data.itemType).toBe('hotel');
    });

    it('should return 404 for non-existent item', async () => {
      Flight.findByPk = jest.fn(() => Promise.resolve(null));
      Hotel.findByPk = jest.fn(() => Promise.resolve(null));
      Transportation.findByPk = jest.fn(() => Promise.resolve(null));
      Event.findByPk = jest.fn(() => Promise.resolve(null));
      CarRental.findByPk = jest.fn(() => Promise.resolve(null));

      const response = await authRequest('get', '/api/v1/item/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Item not found');
    });

    it('should deny access to other users items', async () => {
      Flight.findByPk = jest.fn(() =>
        Promise.resolve({
          id: 'flight-123',
          userId: 'other-user',
          flightNumber: 'AA100',
        })
      );

      const response = await authRequest('get', '/api/v1/item/flight-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('PUT /api/v1/item/:id', () => {
    it('should update a flight', async () => {
      const mockFlight = {
        id: 'flight-123',
        userId: mockUserId,
        flightNumber: 'AA100',
      };

      Flight.findByPk = jest.fn(() => Promise.resolve(mockFlight));

      const updateData = {
        itemType: 'flight',
        flightNumber: 'AA200',
      };

      const response = await authRequest('put', '/api/v1/item/flight-123').send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(FlightService.prototype.updateItem).toHaveBeenCalledWith(
        mockFlight,
        expect.objectContaining({ flightNumber: 'AA200' }),
        mockUserId
      );
    });

    it('should require itemType', async () => {
      const response = await authRequest('put', '/api/v1/item/flight-123').send({
        flightNumber: 'AA200',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('itemType is required');
    });

    it('should return 404 for non-existent item', async () => {
      Flight.findByPk = jest.fn(() => Promise.resolve(null));

      const response = await authRequest('put', '/api/v1/item/nonexistent').send({
        itemType: 'flight',
        flightNumber: 'AA200',
      });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/item/:id', () => {
    it('should delete a flight', async () => {
      const mockFlight = {
        id: 'flight-123',
        userId: mockUserId,
        flightNumber: 'AA100',
      };

      Flight.findByPk = jest.fn(() => Promise.resolve(mockFlight));

      const response = await authRequest('delete', '/api/v1/item/flight-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('flight deleted successfully');
      expect(FlightService.prototype.deleteItem).toHaveBeenCalledWith(mockFlight, mockUserId);
    });

    it('should delete a hotel', async () => {
      const mockHotel = {
        id: 'hotel-123',
        userId: mockUserId,
        hotelName: 'Hilton',
      };

      Flight.findByPk = jest.fn(() => Promise.resolve(null));
      Hotel.findByPk = jest.fn(() => Promise.resolve(mockHotel));

      const response = await authRequest('delete', '/api/v1/item/hotel-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('hotel deleted successfully');
      expect(HotelService.prototype.deleteItem).toHaveBeenCalledWith(mockHotel, mockUserId);
    });

    it('should return 404 for non-existent item', async () => {
      Flight.findByPk = jest.fn(() => Promise.resolve(null));
      Hotel.findByPk = jest.fn(() => Promise.resolve(null));
      Transportation.findByPk = jest.fn(() => Promise.resolve(null));
      Event.findByPk = jest.fn(() => Promise.resolve(null));
      CarRental.findByPk = jest.fn(() => Promise.resolve(null));

      const response = await authRequest('delete', '/api/v1/item/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should deny access to other users items', async () => {
      Flight.findByPk = jest.fn(() =>
        Promise.resolve({
          id: 'flight-123',
          userId: 'other-user',
        })
      );

      const response = await authRequest('delete', '/api/v1/item/flight-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
