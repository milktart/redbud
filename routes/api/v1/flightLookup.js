const express = require('express');
const { ensureAuthenticated, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../../../controllers/flightLookupController');

const router = express.Router();
router.use(ensureAuthenticated);
router.get('/', ctrl.lookup);
router.post('/refresh', ctrl.refresh);
// Admin endpoints
router.get('/admin/all', requireAdmin, ctrl.adminList);
router.delete('/admin/:id', requireAdmin, ctrl.adminDelete);
router.delete('/admin', requireAdmin, ctrl.adminDeleteAll);
module.exports = router;
