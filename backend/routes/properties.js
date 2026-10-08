const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
const { validateProperty, validate } = require('../middleware/validation');
const authMiddleware = require('../middleware/auth');

// All property routes require a logged-in user
router.use(authMiddleware.authenticate);

router.delete('/clear', propertyController.clearAll); // must come before '/:id'
router.get('/', propertyController.getAll);
router.get('/:id', propertyController.getById);
router.get('/:id/rooms', propertyController.getRooms);
router.post('/', validateProperty, validate, propertyController.create);
router.put('/:id', validateProperty, validate, propertyController.update);
router.delete('/:id', propertyController.delete);
router.put('/:id/rooms/:roomNumber', propertyController.updateRoom);
router.post('/:id/rooms', propertyController.addRoom);
router.delete('/:id/rooms/:roomNumber', propertyController.removeRoom);

module.exports = router;