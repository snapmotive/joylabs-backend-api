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

// Test and diagnostic routes (no longer restricted to non-production)
// Test callback route to simulate a successful OAuth flow
router.get('/square/test-callback', async (req, res) => {
  try {
    console.log('Test callback invoked');
    
    // Show Square environment in the response
    const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    const clientId = process.env.SQUARE_APPLICATION_ID || 'unknown';
    
    // Create a test response page that shows diagnostic information
    // and also provides a button to simulate the callback
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Callback Simulator</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
          .debug { background: #fff8dc; padding: 10px; border-radius: 5px; margin: 10px 0; }
          button { padding: 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          button:hover { background: #45a049; }
          .card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 20px; }
          .environment { display: inline-block; padding: 5px 10px; border-radius: 3px; margin-left: 10px; }
          .sandbox { background: #ffd700; color: #333; }
          .production { background: #32cd32; color: white; }
        </style>
      </head>
      <body>
        <h1>Square OAuth Test Tool 
          <span class="environment ${environment === 'production' ? 'production' : 'sandbox'}">
            ${environment.toUpperCase()}
          </span>
        </h1>
        
        <div class="card">
          <h2>Current Configuration</h2>
          <p><strong>Environment:</strong> ${environment}</p>
          <p><strong>Application ID:</strong> ${clientId.substring(0, 6)}****${clientId.substring(clientId.length - 4)}</p>
          <p><strong>API Base URL:</strong> ${process.env.API_BASE_URL || 'Not set'}</p>
        </div>
        
        <div class="card">
          <h2>Simulate OAuth Callback</h2>
          <p>Click the button below to simulate a successful Square OAuth callback:</p>
          <button onclick="simulateCallback()">Simulate Successful Callback</button>
        </div>
        
        <div class="card debug">
          <h2>Debug Information</h2>
          <pre id="debug">Waiting for callback simulation...</pre>
        </div>
        
        <script>
          function simulateCallback() {
            const debugElement = document.getElementById('debug');
            debugElement.innerText = 'Processing callback...';
            
            // Simulate a callback with a test code
            fetch('/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter')
              .then(response => {
                if (!response.ok) {
                  return response.text().then(text => {
                    throw new Error('Response not OK: ' + text);
                  });
                }
                return response.text();
              })
              .then(data => {
                debugElement.innerText = 'Success! Response:\\n' + data;
              })
              .catch(error => {
                debugElement.innerText = 'Error during callback simulation:\\n' + error;
              });
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Test callback error:', error);
    res.status(500).send('Error in test callback: ' + error.message);
  }
});

// Add a test route that sets up a cookie for easier testing
router.get('/square/set-test-cookie', (req, res) => {
  const state = 'test-state-parameter';
  
  // Set cookie with test state
  res.cookie('square_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000 // 1 hour
  });
  
  // Also create a session entry for it
  if (req.session) {
    if (!req.session.oauthParams) {
      req.session.oauthParams = {};
    }
    
    req.session.oauthParams[state] = {
      codeVerifier: 'test-code-verifier',
      createdAt: new Date().toISOString()
    };
  }
  
  res.send(`
    <html>
      <head>
        <title>Test Cookie Set</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .success { color: green; background: #eeffee; padding: 10px; border-radius: 5px; }
          .card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin: 20px 0; }
          button { padding: 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Test Cookie Set</h1>
        
        <div class="success">
          <p>✅ Cookie 'square_oauth_state' has been set to: <strong>${state}</strong></p>
          <p>✅ Session state has been stored for this parameter</p>
        </div>
        
        <div class="card">
          <h2>Now you can test the callback</h2>
          <p>With this cookie set, you can now test the callback by clicking the button below:</p>
          <button onclick="testCallback()">Test Callback</button>
        </div>
        
        <script>
          function testCallback() {
            window.location.href = '/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter';
          }
        </script>
      </body>
    </html>
  `);
});

// Token refresh endpoint
router.post('/refresh', authMiddleware.authenticate, authController.refreshToken);

// Authenticated routes
router.post('/logout', authMiddleware.authenticate, authController.revokeToken);
router.post('/logout/:userId', authMiddleware.authenticate, authController.revokeToken);

module.exports = router; 