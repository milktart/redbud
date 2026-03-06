/**
 * Test Server Setup
 * Creates an Express app instance for integration testing
 */

const express = require('express');
const cookieParser = require('cookie-parser');

// Create Express app for testing
function createTestApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mock authentication middleware for testing
  // Tests can pass X-Test-User-Id header to simulate an authenticated user
  app.use((req, res, next) => {
    const testUserId = req.get('X-Test-User-Id');
    if (testUserId) {
      req.user = { id: testUserId };
    } else {
      req.user = null;
    }
    next();
  });

  // Mount API routes
  app.use('/api/v1/airports', require('../routes/api/v1/airports'));
  app.use('/api/v1/trips', require('../routes/api/v1/trips'));

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      error: err.message,
    });
  });

  return app;
}

// Helper to authenticate requests
function authenticateRequest(request, userId = 'test-user-123') {
  return request.set('X-Test-User-Id', userId);
}

module.exports = {
  createTestApp,
  authenticateRequest,
};
