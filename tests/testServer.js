/**
 * Test Server Setup
 * Creates an Express app instance for integration testing
 */

const express = require('express');
const session = require('express-session');

// Create Express app for testing
function createTestApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware (simplified for testing)
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  // Mock authentication middleware
  app.use((req, res, next) => {
    // Check for test user header
    const testUserId = req.get('X-Test-User-Id');
    if (testUserId) {
      req.user = { id: testUserId };
      req.isAuthenticated = () => true;
    } else if (req.testUser) {
      req.user = req.testUser;
      req.isAuthenticated = () => true;
    } else {
      req.user = null;
      req.isAuthenticated = () => false;
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
