const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health');
const awsDiagnosticController = require('../controllers/aws-diagnostic');

// Health check routes
router.get('/', healthController.checkHealth);
router.get('/detailed', healthController.checkDetailedHealth);
router.get('/test-page', healthController.renderTestPage);

// OAuth test page
router.get('/oauth-test', healthController.oauthTestPage);

// AWS diagnostic route
router.get('/aws-diagnostic', awsDiagnosticController.runAwsDiagnostic);

module.exports = router; 