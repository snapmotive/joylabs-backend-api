const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const authMiddleware = require('../middleware/auth');

// Square OAuth routes for web
router.get('/square', authController.startSquareOAuth);
router.get('/square/callback', authController.handleSquareCallback);
router.post('/square/callback', authController.handleSquareCallback);
router.get('/success', authController.oauthSuccess);

// Square OAuth route for mobile
router.get('/square/mobile-init', authController.initMobileOAuth);

// Token refresh endpoint
router.post('/refresh', authMiddleware.authenticate, authController.refreshToken);

// Authenticated routes
router.post('/logout', authMiddleware.authenticate, authController.revokeToken);
router.post('/logout/:userId', authMiddleware.authenticate, authController.revokeToken);

module.exports = router; 