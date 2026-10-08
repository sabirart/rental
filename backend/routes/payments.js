const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { validatePayment, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.authenticate);

router.get('/', paymentController.getAll);
router.get('/dashboard-stats', paymentController.getDashboardStats);
router.get('/monthly-summary', paymentController.getMonthlySummary);
router.get('/:id', paymentController.getById);
router.get('/tenant/:tenantId', paymentController.getByTenant);
router.post('/', validatePayment, validate, paymentController.create);
router.put('/:id', validatePayment, validate, paymentController.update);
router.delete('/:id', paymentController.delete);

module.exports = router;