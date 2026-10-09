// routes/auth.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { getStatus } = require('../services/googleDrive');
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
router.get('/google/start', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
// Google OAuth is the only public authentication flow.

// Protected routes
router.get('/me', authMiddleware.authenticate, authController.me);
router.get('/backup/status', authMiddleware.authenticate, authController.backupStatus);
router.get('/backup/export', authMiddleware.authenticate, authController.exportBackup);
router.post('/backup/import', authMiddleware.authenticate, authController.importBackup);
router.post('/backup', authMiddleware.authenticate, authController.backup);
router.post('/backup/restore', authMiddleware.authenticate, authController.restoreBackup);
router.post('/backup/new-account', authMiddleware.authenticate, authController.startFreshAccount);
router.get('/google-drive/status', authMiddleware.authenticate, async (req, res, next) => { try { res.json({ success: true, data: await getStatus(req) }); } catch (e) { next(e); } });
router.put('/profile', authMiddleware.authenticate, [
    body('name').optional().trim().escape(),
    body('profilePic').optional().trim(),
    body('profileComplete').optional().isBoolean(),
    validate
], authController.updateProfile);

router.post('/account/delete', authMiddleware.authenticate, authController.deleteAccount);
router.post('/logout', authMiddleware.authenticate, authController.logout);
module.exports = router;
