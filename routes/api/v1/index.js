/**
 * API v1 Routes
 * Base router for all v1 API endpoints
 */

const express = require('express');

const router = express.Router();

// Import v1 route modules
const authRoutes = require('./auth');
const tripsRoutes = require('./trips');
const itemRoutes = require('./item');
const airportsRoutes = require('./airports');
const geocodeRoutes = require('./geocode');
const companionsRoutes = require('./companions');
const attendeesRoutes = require('./attendees');
const vouchersRoutes = require('./vouchers');
const usersRoutes = require('./users');

// Mount route modules
router.use('/auth', authRoutes);
router.use('/trips', tripsRoutes);
router.use('/item', itemRoutes);
router.use('/companions', companionsRoutes);
router.use('/attendees', attendeesRoutes);
router.use('/vouchers', vouchersRoutes);
router.use('/airports', airportsRoutes);
router.use('/geocode', geocodeRoutes);
router.use('/users', usersRoutes);

module.exports = router;
