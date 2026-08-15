// routes/auth.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
        });
    }
    next();
};

// Public routes
router.post('/register', [
    body('name').notEmpty().withMessage('Name is required').trim().escape(),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.register);

router.post('/verify-email', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    validate
], authController.verifyEmail);

router.post('/resend-verification', [
    body('email').isEmail().withMessage('Valid email is required'),
    validate
], authController.resendVerification);

router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
], authController.login);

router.post('/google-login', [
    body('token').notEmpty().withMessage('Google token is required'),
    validate
], authController.googleLogin);

router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email is required'),
    validate
], authController.forgotPassword);

router.post('/reset-password', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.resetPassword);

// Protected routes
router.get('/me', authMiddleware.authenticate, authController.me);
router.put('/profile', authMiddleware.authenticate, [
    body('name').optional().trim().escape(),
    body('profilePic').optional().trim(),
    validate
], authController.updateProfile);

router.post('/change-password', authMiddleware.authenticate, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate
], authController.changePassword);

router.post('/logout', authMiddleware.authenticate, authController.logout);
router.delete('/account', authMiddleware.authenticate, [
    body('password').optional(),
    validate
], authController.deleteAccount);

module.exports = router;