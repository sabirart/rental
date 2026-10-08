const express = require('express');
const router = express.Router();
const recycleController = require('../controllers/recycleController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.authenticate);

router.get('/', recycleController.getAll);
router.get('/count', recycleController.getCount);
router.post('/recover/:id', recycleController.recover);
router.delete('/:id', recycleController.deletePermanently);
router.delete('/clear/all', recycleController.clearAll);
router.delete('/clear/old', recycleController.deleteOldItems);

module.exports = router;