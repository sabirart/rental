// routes/tenants.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { validateTenant, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

// All tenant routes require authentication
router.use(authMiddleware.authenticate);

router.get('/', tenantController.getAll);
router.get('/:id', tenantController.getById);
router.get('/property/:propertyId', tenantController.getByProperty);
router.post('/', validateTenant, validate, tenantController.create);
router.put('/:id', validateTenant, validate, tenantController.update);
router.delete('/:id', tenantController.delete);
router.delete('/clear', tenantController.clearAll);

module.exports = router;