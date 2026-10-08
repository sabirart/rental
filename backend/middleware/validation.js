const { body, validationResult } = require('express-validator');

const validateTenant = [
    body('name').notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters').trim().escape(),
    body('fatherName').notEmpty().withMessage('Father name is required').isLength({ min: 2, max: 100 }).withMessage('Father name must be between 2 and 100 characters').trim().escape(),
    body('cnic').notEmpty().withMessage('CNIC is required').matches(/^[0-9]{5}-[0-9]{7}-[0-9]{1}$/).withMessage('Invalid CNIC format. Use: XXXXX-XXXXXXX-X').trim(),
    body('location').notEmpty().withMessage('Location is required').isLength({ min: 2, max: 200 }).withMessage('Location must be between 2 and 200 characters').trim().escape(),
    body('propertyId').notEmpty().withMessage('Property ID is required').isString().withMessage('Property ID must be a string').trim(),
    body('roomNumber').notEmpty().withMessage('Room number is required').isInt({ min: 1 }).withMessage('Room number must be a positive integer').toInt(),
    body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive').trim(),
    body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters').trim().escape(),
    body('profile_pic').optional().isString().withMessage('Profile picture must be a string').trim(),
    body('documents').optional().isArray().withMessage('Documents must be an array'),
    body('mobileNumber').optional({ nullable: true, checkFalsy: true }).isLength({ min: 7, max: 20 }).withMessage('Mobile number must be between 7 and 20 characters').trim(),
    body('advancePayment').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Advance payment must be a positive number').toFloat(),
    body('leaseEndDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Lease end date must be a valid date')
];

const validateProperty = [
    body('name').notEmpty().withMessage('Property name is required').isLength({ min: 2, max: 100 }).withMessage('Property name must be between 2 and 100 characters').trim().escape(),
    body('address').notEmpty().withMessage('Address is required').isLength({ min: 5, max: 500 }).withMessage('Address must be between 5 and 500 characters').trim().escape(),
    body('totalRooms').notEmpty().withMessage('Total rooms is required').isInt({ min: 1 }).withMessage('Total rooms must be at least 1').toInt(),
    body('baseRent').notEmpty().withMessage('Base rent is required').isFloat({ min: 0 }).withMessage('Base rent must be a positive number').toFloat(),
    body('status').optional().isIn(['active', 'inactive', 'maintenance']).withMessage('Status must be active, inactive, or maintenance').trim(),
    body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters').trim().escape()
];

const validatePayment = [
    body('tenantId').notEmpty().withMessage('Tenant ID is required').isString().withMessage('Tenant ID must be a string').trim(),
    body('month').notEmpty().withMessage('Month is required').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12').toInt(),
    body('year').notEmpty().withMessage('Year is required').isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100').toInt(),
    body('monthlyRent').notEmpty().withMessage('Monthly rent is required').isFloat({ min: 0 }).withMessage('Monthly rent must be a positive number').toFloat(),
    body('electricityGas').optional().isFloat({ min: 0 }).withMessage('Electricity/Gas must be a positive number').toFloat(),
    body('previousDues').optional().isFloat({ min: 0 }).withMessage('Previous dues must be a positive number').toFloat(),
    body('amountPaid').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Amount paid must be a positive number').toFloat(),
    body('status').optional().isIn(['paid', 'partial', 'unpaid']).withMessage('Status must be paid, partial, or unpaid').trim(),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters').trim().escape()
];

const validateRoom = [
    body('roomNumber').notEmpty().withMessage('Room number is required').isInt({ min: 1 }).withMessage('Room number must be a positive integer').toInt(),
    body('status').optional().isIn(['available', 'occupied', 'maintenance']).withMessage('Status must be available, occupied, or maintenance').trim(),
    body('tenantId').optional().isString().withMessage('Tenant ID must be a string').trim()
];

const validateBulkOperation = [
    body('ids').notEmpty().withMessage('IDs are required').isArray().withMessage('IDs must be an array').custom((value) => {
        if (value.length === 0) {
            throw new Error('IDs array cannot be empty');
        }
        return true;
    })
];

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    
    const extractedErrors = errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
    }));
    
    return res.status(400).json({
        success: false,
        errors: extractedErrors,
        message: 'Validation failed'
    });
};

const sanitizeBody = (req, res, next) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }
    next();
};

module.exports = { 
    validateTenant, 
    validateProperty, 
    validatePayment,
    validateRoom,
    validateBulkOperation,
    validate,
    sanitizeBody
};