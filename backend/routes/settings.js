const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { validateSettings, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.authenticate);

router.get('/', settingsController.get);
router.put('/', validateSettings, validate, settingsController.update);
router.delete('/data', settingsController.clearAll);

module.exports = router;
