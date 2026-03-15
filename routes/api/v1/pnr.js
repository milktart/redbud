const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const pnrController = require('../../../controllers/pnrController');

const router = express.Router();

router.use(ensureAuthenticated);
router.post('/lookup', pnrController.lookupPnr);

module.exports = router;
