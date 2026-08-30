const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.authenticate);

router.get('/', settingsController.get);
router.put('/', settingsController.update);

module.exports = router;
