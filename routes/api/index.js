/**
 * API Routes Router
 * Mounts all versioned API routes
 */

const express = require('express');

const router = express.Router();

// Mount v1 API routes
const v1Routes = require('./v1');

router.use('/v1', v1Routes);

module.exports = router;
