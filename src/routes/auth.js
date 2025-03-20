const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const authMiddleware = require('../middleware/auth');

// Square OAuth routes
router.get('/square', authController.startSquareOAuth);
router.get('/square/callback', authController.handleSquareCallback);
router.get('/success', authController.oauthSuccess);

// Authenticated routes
router.post('/logout/:userId', authMiddleware.authenticate, authController.revokeToken);

module.exports = router; 