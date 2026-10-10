'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { getStatus } = require('../services/googleDrive');
const { validateProfile, validate } = require('../middleware/validation');
const { body } = require('express-validator');

const guard = authMiddleware.authenticate;

// Public
router.get('/google/start', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.post('/logout', authController.logout); // must work with an expired session

// Protected
router.get('/me', guard, authController.me);
router.get('/backup/status', guard, authController.backupStatus);
router.get('/backup/export', guard, authController.exportBackup);
router.post('/backup/import', guard, authController.importBackup);
router.post('/backup', guard, authController.backup);
router.post('/backup/restore', guard, [body('backupId').optional({ nullable: true }).isString().isLength({ max: 200 }), validate], authController.restoreBackup);
router.post('/backup/new-account', guard, authController.startFreshAccount);
router.get('/google-drive/status', guard, async (req, res, next) => { try { res.json({ success: true, data: await getStatus(req, res) }); } catch (e) { next(e); } });
router.put('/profile', guard, validateProfile, validate, authController.updateProfile);
router.get('/account/delete-preview', guard, authController.deletePreview);
router.post('/account/delete', guard, authController.deleteAccount);

module.exports = router;
