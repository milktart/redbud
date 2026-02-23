/* eslint-env jest */
// tests/setup.js - Test configuration and global setup

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'test_travel_planner';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';
process.env.LOG_LEVEL = 'error'; // Suppress logs during testing

// DO NOT mock logger globally - logger.test.js needs to test the real implementation
// Individual test files should mock logger locally if needed

// Increase timeout for database operations
jest.setTimeout(10000);

// Global test utilities
global.testHelpers = {
  // Create test user data
  createTestUser: (overrides = {}) => ({
    email: 'test@example.com',
    password: 'hashedPassword123',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  }),

  // Create test trip data
  createTestTrip: (userId, overrides = {}) => ({
    name: 'Test Trip',
    purpose: 'pleasure',
    departureDate: '2025-06-01',
    returnDate: '2025-06-10',
    userId,
    ...overrides,
  }),

  // Create test flight data
  createTestFlight: (tripId, overrides = {}) => ({
    flightNumber: 'AA100',
    airline: 'American Airlines',
    origin: 'AUS',
    destination: 'LAX',
    departureDate: '2025-06-01',
    departureTime: '10:00',
    arrivalDate: '2025-06-01',
    arrivalTime: '12:00',
    tripId,
    ...overrides,
  }),

  // Create test companion data
  createTestCompanion: (userId, overrides = {}) => ({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    createdBy: userId,
    ...overrides,
  }),

  // Create test voucher data
  createTestVoucher: (userId, overrides = {}) => ({
    type: 'TRAVEL_CREDIT',
    issuer: 'Test Airlines',
    totalValue: 100.0,
    usedAmount: 0,
    status: 'OPEN',
    issueDate: '2025-01-01',
    expirationDate: '2026-01-01',
    userId,
    ...overrides,
  }),
};
