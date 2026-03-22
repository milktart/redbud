const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const ctrl = require('../../../controllers/flightLookupController');

const router = express.Router();
router.use(ensureAuthenticated);
router.get('/', ctrl.lookup);
router.post('/refresh', ctrl.refresh);
module.exports = router;
