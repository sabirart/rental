const express = require('express');
const router = express.Router();
const recycleController = require('../controllers/recycleController');
const { validateRecycleDays, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.authenticate);

router.get('/', recycleController.getAll);
router.get('/count', recycleController.getCount);
router.post('/recover/:id', recycleController.recover);
router.delete('/clear/all', recycleController.clearAll);
router.delete('/clear/old', validateRecycleDays, validate, recycleController.deleteOldItems);
router.delete('/:id', recycleController.deletePermanently);

module.exports = router;