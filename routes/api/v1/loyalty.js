const express = require('express');
const loyaltyController = require('../../../controllers/loyaltyController');
const { ensureAuthenticated } = require('../../../middleware/auth');

const router = express.Router();

router.use(ensureAuthenticated);

router.get('/', loyaltyController.getMyPrograms);
router.post('/', loyaltyController.addProgram);
router.put('/:id', loyaltyController.updateProgram);
router.delete('/:id', loyaltyController.deleteProgram);

module.exports = router;
