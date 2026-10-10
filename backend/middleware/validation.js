'use strict';
const { body, query, validationResult } = require('express-validator');
const { IMAGE_URI_RE, DOC_URI_RE, MAX_DATA_URI_CHARS } = require('../services/backupSchema');
const { MAX_MONEY } = require('../services/paymentMath');

const money = (field, label, { required = false } = {}) => {
  const chain = required
    ? body(field).notEmpty().withMessage(`${label} is required`)
    : body(field).optional({ nullable: true, checkFalsy: true });
  return chain.isFloat({ min: 0, max: MAX_MONEY }).withMessage(`${label} must be between 0 and ${MAX_MONEY.toLocaleString('en-US')}`).toFloat();
};

// Text is stored as plain text; output escaping happens where it is rendered
// (never HTML-encode on input: it corrupts stored data and exports).
const text = (field, label, { min = 0, max, required = false }) => {
  const chain = required
    ? body(field).trim().notEmpty().withMessage(`${label} is required`)
    : body(field).optional({ nullable: true }).trim();
  return chain.isLength({ min, max }).withMessage(`${label} must be between ${min} and ${max} characters`);
};

const imageField = (field) => body(field).optional({ nullable: true, checkFalsy: true }).isString().withMessage('Image must be a string')
  .custom((v) => v.length <= MAX_DATA_URI_CHARS && IMAGE_URI_RE.test(v)).withMessage('Image must be a PNG, JPEG, GIF or WebP file under the size limit');

const validateTenant = [
  text('name', 'Name', { min: 2, max: 100, required: true }),
  text('fatherName', 'Father name', { min: 2, max: 100, required: true }),
  body('cnic').trim().notEmpty().withMessage('CNIC is required').matches(/^[0-9]{5}-[0-9]{7}-[0-9]{1}$/).withMessage('Invalid CNIC format. Use: XXXXX-XXXXXXX-X'),
  text('location', 'Location', { min: 2, max: 200, required: true }),
  body('propertyId').notEmpty().withMessage('Property ID is required').isString().withMessage('Property ID must be a string').trim().isLength({ max: 160 }).withMessage('Property ID is too long'),
  body('roomNumber').notEmpty().withMessage('Room number is required').isInt({ min: 1, max: 10000 }).withMessage('Room number must be a positive integer').toInt(),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive').trim(),
  text('description', 'Description', { max: 500 }),
  imageField('profile_pic'),
  body('documents').optional({ nullable: true }).isArray({ max: 5 }).withMessage('Documents must be a list of at most 5 files')
    .bail().custom((docs) => docs.every((d) => d && typeof d === 'object' && typeof d.data === 'string' && d.data.length <= MAX_DATA_URI_CHARS && DOC_URI_RE.test(d.data) && String(d.name || '').length <= 255))
    .withMessage('Each document must be a PDF, Word file or image under the size limit'),
  body('mobileNumber').optional({ nullable: true, checkFalsy: true }).isLength({ min: 7, max: 30 }).withMessage('Mobile number must be between 7 and 30 characters').trim(),
  money('advancePayment', 'Advance payment'),
  body('leaseEndDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Lease end date must be a valid date')
];

const validateProperty = [
  text('name', 'Property name', { min: 2, max: 100, required: true }),
  text('address', 'Address', { min: 5, max: 500, required: true }),
  body('totalRooms').notEmpty().withMessage('Total rooms is required').isInt({ min: 1, max: 1000 }).withMessage('Total rooms must be between 1 and 1000').toInt(),
  money('baseRent', 'Base rent', { required: true }),
  body('status').optional().isIn(['active', 'inactive', 'maintenance']).withMessage('Status must be active, inactive, or maintenance').trim(),
  text('description', 'Description', { max: 500 })
];

const validatePayment = [
  body('tenantId').notEmpty().withMessage('Tenant ID is required').isString().withMessage('Tenant ID must be a string').trim().isLength({ max: 160 }).withMessage('Tenant ID is too long'),
  body('month').notEmpty().withMessage('Month is required').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12').toInt(),
  body('year').notEmpty().withMessage('Year is required').isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100').toInt(),
  money('monthlyRent', 'Monthly rent', { required: true }),
  money('electricity', 'Electricity'),
  money('gas', 'Gas'),
  money('previousDues', 'Previous dues'),
  ...['rentEnabled', 'electricityEnabled', 'gasEnabled', 'previousDuesEnabled'].map((f) => body(f).optional({ nullable: true }).isBoolean().withMessage(`${f} must be boolean`).toBoolean()),
  // 0 is a valid amount (nothing received), so no checkFalsy here.
  body('amountPaid').optional({ nullable: true, values: 'null' }).if((v) => v !== '').isFloat({ min: 0, max: MAX_MONEY }).withMessage(`Amount paid must be between 0 and ${MAX_MONEY.toLocaleString('en-US')}`).toFloat(),
  body('status').optional().isIn(['paid', 'partial', 'unpaid']).withMessage('Status must be paid, partial, or unpaid').trim(),
  body('customCharges').optional({ nullable: true }).isArray({ max: 20 }).withMessage('Custom charges must be a list of at most 20 items'),
  text('notes', 'Notes', { max: 500 })
];

const validateRoom = [
  body('roomNumber').notEmpty().withMessage('Room number is required').isInt({ min: 1, max: 10000 }).withMessage('Room number must be a positive integer').toInt(),
  body('roomName').optional({ nullable: true }).isLength({ max: 100 }).withMessage('Room name must be at most 100 characters').trim(),
  money('rentAmount', 'Rent amount')
];

const validateRoomUpdate = [
  body('status').optional().isIn(['available', 'occupied', 'maintenance']).withMessage('Status must be available, occupied, or maintenance'),
  body('tenantId').optional({ nullable: true }).isString().withMessage('Tenant ID must be a string').trim(),
  body('roomName').optional({ nullable: true }).isLength({ max: 100 }).withMessage('Room name must be at most 100 characters').trim(),
  money('rentAmount', 'Rent amount')
];

const validateProfile = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  body('profilePic').optional({ nullable: true, checkFalsy: true }).isString()
    .custom((v) => v.length <= MAX_DATA_URI_CHARS && (IMAGE_URI_RE.test(v) || /^https:\/\/[^\s"'<>]{1,2000}$/.test(v))).withMessage('Profile photo must be an image file or an https link'),
  body('profileComplete').optional().isBoolean().withMessage('profileComplete must be boolean')
];

const validateRecycleDays = [
  query('days').optional().isInt({ min: 1, max: 3650 }).withMessage('days must be a whole number between 1 and 3650').toInt()
];

const validateSettings = [
  body('notificationsEnabled').optional().isBoolean().withMessage('notificationsEnabled must be boolean').toBoolean(),
  body('monthlyResetDay').optional().isInt({ min: 1, max: 31 }).withMessage('Monthly reset day must be between 1 and 31').toInt()
];

// Never echo submitted values back: they can contain CNICs or large base64 blobs.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const list = errors.array({ onlyFirstError: true }).map((err) => ({ field: err.path, message: err.msg }));
  return res.status(400).json({
    success: false, errors: list, error: list[0].message, message: 'Validation failed', timestamp: new Date().toISOString()
  });
};

module.exports = {
  validateTenant, validateProperty, validatePayment, validateRoom, validateRoomUpdate,
  validateProfile, validateRecycleDays, validateSettings, validate
};
