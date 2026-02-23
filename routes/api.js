const express = require('express');

const router = express.Router();

// Mount API v1 routes
const v1Routes = require('./api/v1');

router.use('/v1', v1Routes);

module.exports = router;
