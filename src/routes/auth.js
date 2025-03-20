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

// Development/Testing routes - will only work in non-production environments
if (process.env.NODE_ENV !== 'production') {
  router.get('/square/test-callback', (req, res) => {
    console.log('TEST ROUTE: Simulating Square callback');
    // Add test code parameter
    req.query.code = 'test_authorization_code';
    // Add test state parameter
    req.query.state = 'test-state-parameter';
    // Call the regular callback handler
    authController.handleSquareCallback(req, res);
  });
}

// Token refresh endpoint
router.post('/refresh', authMiddleware.authenticate, authController.refreshToken);

// Authenticated routes
router.post('/logout', authMiddleware.authenticate, authController.revokeToken);
router.post('/logout/:userId', authMiddleware.authenticate, authController.revokeToken);

module.exports = router; 