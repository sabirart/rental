// routes/tenants.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { validateTenant, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

// All tenant routes require authentication
router.use(authMiddleware.authenticate);

router.get('/', tenantController.getAll);
router.get('/property/:propertyId', tenantController.getByProperty);
router.delete('/clear', tenantController.clearAll); // must come before '/:id'
router.get('/:id', tenantController.getById);
router.post('/', validateTenant, validate, tenantController.create);
router.put('/:id', validateTenant, validate, tenantController.update);
router.delete('/:id', tenantController.delete);

module.exports = router;