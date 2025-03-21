const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const authMiddleware = require('../middleware/auth');
const squareService = require('../services/square');
const { generateOAuthUrl, exchangeCodeForToken, getMerchantInfo, getSquareClient } = require('../services/square');
const { generateStateParam, generateCodeVerifier, generateCodeChallenge } = require('../services/square');
const { createUser, findUserBySquareMerchantId, updateUser } = require('../models/user');
const jwt = require('jsonwebtoken');

// Square OAuth routes for web
router.get('/square', async (req, res) => {
  try {
    console.log('Starting Square OAuth flow');
    console.log('Environment:', process.env.SQUARE_ENVIRONMENT);
    console.log('Application ID:', process.env.SQUARE_APPLICATION_ID ? 'Set' : 'Not Set');
    
    // For sandbox testing, bypass Square's login page
    if (process.env.SQUARE_ENVIRONMENT === 'sandbox') {
      console.log('Using sandbox mode - bypassing Square login');
      // Redirect directly to callback with test code
      const state = generateStateParam();
      res.cookie('square_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000 // 1 hour
      });
      
      const callbackUrl = new URL('/api/auth/square/callback', `http://${req.headers.host}`);
      callbackUrl.searchParams.set('code', 'test_authorization_code');
      callbackUrl.searchParams.set('state', state);
      
      return res.redirect(callbackUrl.toString());
    }
    
    // Generate secure state parameter
    const state = generateStateParam();
    
    // Store state in cookie to verify when callback happens
    res.cookie('square_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    // Generate authorization URL - no PKCE to avoid CSP issues
    const url = await generateOAuthUrl(state);
    console.log('Redirecting to Square OAuth URL:', url);
    
    // Redirect to Square's OAuth page
    res.redirect(url);
  } catch (error) {
    console.error('Error initiating OAuth flow:', error);
    res.status(500).json({ 
      error: 'Failed to initiate OAuth flow',
      details: error.message,
      env: process.env.NODE_ENV === 'development' ? {
        SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
        REDIRECT_URL: process.env.SQUARE_REDIRECT_URL
      } : undefined
    });
  }
});

// Handle callback from Square
router.get('/square/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    console.log('OAuth callback received:', { code: !!code, state, error });
    
    // Check for OAuth errors
    if (error) {
      console.error('Square OAuth error:', error, error_description);
      return res.status(400).json({ 
        error: 'OAuth error',
        details: error_description || error
      });
    }
    
    // Get stored state
    const storedState = req.cookies.square_oauth_state;
    
    // Clear OAuth cookies immediately
    res.clearCookie('square_oauth_state');
    
    // Validate state parameter
    if (!state || !storedState || state !== storedState) {
      console.error('State parameter mismatch');
      console.log('Received state:', state);
      console.log('Stored state:', storedState);
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Exchange code for token - no code verifier needed since we're not using PKCE
    console.log('Exchanging code for token...');
    const tokenData = await exchangeCodeForToken(code);
    console.log('Token exchange successful');
    
    // Get merchant information
    console.log('Getting merchant info...');
    const merchantInfo = await getMerchantInfo(tokenData.access_token);
    console.log('Merchant info retrieved:', merchantInfo.id);
    
    // Find or create user
    let user = await findUserBySquareMerchantId(merchantInfo.id);
    
    if (user) {
      // Update existing user
      user = await updateUser(user.id, {
        square_access_token: tokenData.access_token,
        square_refresh_token: tokenData.refresh_token,
        square_token_expires_at: tokenData.expires_at,
        name: merchantInfo.name,
        email: merchantInfo.email
      });
    } else {
      // Create new user
      user = await createUser({
        square_merchant_id: merchantInfo.id,
        square_access_token: tokenData.access_token,
        square_refresh_token: tokenData.refresh_token,
        square_token_expires_at: tokenData.expires_at,
        name: merchantInfo.name,
        email: merchantInfo.email
      });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        merchantId: merchantInfo.id
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Redirect to frontend with token
    const redirectUrl = new URL('/auth/callback', process.env.FRONTEND_URL || 'http://localhost:3000');
    redirectUrl.searchParams.set('token', token);
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).json({ 
      error: 'Failed to complete OAuth flow',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Square OAuth route for mobile
router.get('/square/mobile-init', authController.initMobileOAuth);

// Test and diagnostic routes (no longer restricted to non-production)
// Add a complete test route that allows testing the Square OAuth flow
router.get('/square/test', (req, res) => {
  // Display a helpful debugging page
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Square OAuth Test Tool</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
          }
          h1 { color: #4CAF50; }
          h2 { margin-top: 30px; }
          pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre-wrap;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          table, th, td {
            border: 1px solid #ddd;
          }
          th, td {
            padding: 10px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 5px 0;
          }
          .warning { color: #ff9800; }
          .error { color: #f44336; }
          .success { color: #4CAF50; }
          #verifyResult {
            display: none;
            margin-top: 15px;
          }
          .token-input {
            width: 100%;
            padding: 8px;
            margin: 5px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <h1>Square OAuth Test Tool</h1>
        
        <div class="card">
          <h2>Environment</h2>
          <table>
            <tr>
              <th>Setting</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
            <tr>
              <td>SQUARE_ENVIRONMENT</td>
              <td>${process.env.SQUARE_ENVIRONMENT || 'Not set'}</td>
              <td>${process.env.SQUARE_ENVIRONMENT === 'production' ? 
                '<span class="warning">⚠️ Production mode - test codes won\'t work</span>' : 
                '<span class="success">✓ Sandbox mode - good for testing</span>'}</td>
            </tr>
            <tr>
              <td>SQUARE_APPLICATION_ID</td>
              <td>${process.env.SQUARE_APPLICATION_ID ? '✓ Set' : '✗ Not set'}</td>
              <td>${process.env.SQUARE_APPLICATION_ID ? 
                '<span class="success">✓</span>' : 
                '<span class="error">✗ Missing application ID</span>'}</td>
            </tr>
            <tr>
              <td>SQUARE_APPLICATION_SECRET</td>
              <td>${process.env.SQUARE_APPLICATION_SECRET ? '✓ Set (hidden)' : '✗ Not set'}</td>
              <td>${process.env.SQUARE_APPLICATION_SECRET ? 
                '<span class="success">✓</span>' : 
                '<span class="error">✗ Missing application secret</span>'}</td>
            </tr>
            <tr>
              <td>SQUARE_REDIRECT_URL</td>
              <td>${process.env.SQUARE_REDIRECT_URL || 'Not set'}</td>
              <td>${process.env.SQUARE_REDIRECT_URL ? 
                (process.env.SQUARE_REDIRECT_URL.includes(req.headers.host) ? 
                  '<span class="success">✓ Matches current host</span>' : 
                  `<span class="warning">⚠️ Does not match current host (${req.headers.host})</span>`) : 
                '<span class="error">✗ Missing redirect URL</span>'}</td>
            </tr>
            <tr>
              <td>Current Host</td>
              <td>${req.headers.host}</td>
              <td></td>
            </tr>
            <tr>
              <td>Current Protocol</td>
              <td>${req.protocol}</td>
              <td>${req.protocol === 'https' ? 
                '<span class="success">✓ Secure</span>' : 
                '<span class="warning">⚠️ Not secure - Square may require HTTPS</span>'}</td>
            </tr>
          </table>
        </div>
        
        <div class="card">
          <h2>Test OAuth Flow</h2>
          <p>Use these links to test different parts of the OAuth flow:</p>
          
          <div>
            <a href="/api/auth/square?state=test-state-parameter" class="button">Start Regular OAuth Flow</a>
            <a href="/api/auth/square/mobile-init" class="button">Start Mobile OAuth Flow (PKCE)</a>
          </div>
          
          <h3>Test Callback</h3>
          <p>This simulates a callback with test codes:</p>
          <div>
            <a href="/api/auth/square/set-test-cookie" class="button">1. Set Test Cookies</a>
            <a href="/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter" class="button">2. Test Callback</a>
          </div>
        </div>

        <div class="card">
          <h2>Test Connection Verification</h2>
          <p>After successful authentication, you can verify the Square connection using your JWT token:</p>
          
          <input type="text" id="jwtToken" class="token-input" placeholder="Paste your JWT token here" />
          <button onclick="verifyConnection()" class="button">Verify Connection</button>
          
          <div id="verifyResult">
            <h3>Verification Result:</h3>
            <pre id="verifyOutput"></pre>
          </div>

          <script>
            async function verifyConnection() {
              const token = document.getElementById('jwtToken').value;
              const resultDiv = document.getElementById('verifyResult');
              const output = document.getElementById('verifyOutput');
              
              resultDiv.style.display = 'block';
              output.innerHTML = 'Testing connection...';
              
              try {
                const response = await fetch('/api/auth/square/verify', {
                  headers: {
                    'Authorization': 'Bearer ' + token
                  }
                });
                
                const data = await response.json();
                output.innerHTML = JSON.stringify(data, null, 2);
                
                if (response.ok) {
                  output.className = 'success';
                } else {
                  output.className = 'error';
                }
              } catch (error) {
                output.innerHTML = 'Error: ' + error.message;
                output.className = 'error';
              }
            }
          </script>
        </div>
      </body>
    </html>
  `);
});

// Test callback route to simulate a successful OAuth flow
router.get('/square/test-callback', async (req, res) => {
  try {
    console.log('Test callback invoked');
    
    // Show Square environment in the response
    const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    const clientId = process.env.SQUARE_APPLICATION_ID || 'unknown';
    
    // Set test cookie for state validation
    const testState = 'test-state-parameter';
    res.cookie('square_oauth_state', testState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    // Setup session state if we're using sessions
    if (req.session) {
      if (!req.session.oauthParams) {
        req.session.oauthParams = {};
      }
      
      req.session.oauthParams[testState] = {
        codeVerifier: 'test-code-verifier',
        createdAt: new Date().toISOString()
      };
    }
    
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
          .warning { color: #f44336; }
          .success { color: #4CAF50; }
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
          <p><strong class="success">✓ Test state cookie set: </strong> ${testState}</p>
        </div>
        
        <div class="card">
          <h2>Important Notes</h2>
          <p class="warning"><strong>Important:</strong> This tool has set a required cookie in your browser called <code>square_oauth_state</code> with the value <code>${testState}</code>.</p>
          <p>This cookie is necessary for the callback to work correctly with state validation.</p>
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
            
            // Directly load the page rather than using fetch which doesn't send cookies
            window.location.href = '/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter';
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
  console.log('Setting test cookies for OAuth testing');
  
  // Set test cookies
  res.cookie('square_oauth_state', 'test-state-parameter', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000 // 1 hour
  });
  
  res.cookie('square_oauth_code_verifier', 'test_code_verifier', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000 // 1 hour
  });
  
  res.send(`
    <html>
      <head>
        <title>Test Cookies Set</title>
        <style>
          body {
            font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.5;
            margin: 40px auto;
            max-width: 650px;
            padding: 0 20px;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
          }
          h1 { color: #4CAF50; }
          .button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Test Cookies Set</h1>
          <p>The following cookies have been set:</p>
          <ul>
            <li><strong>square_oauth_state</strong>: test-state-parameter</li>
            <li><strong>square_oauth_code_verifier</strong>: test_code_verifier</li>
          </ul>
          <p>You can now proceed to test the callback:</p>
          <p><a href="/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter" class="button">Test Callback</a></p>
        </div>
      </body>
    </html>
  `);
});

// Token refresh endpoint
router.post('/refresh', authMiddleware.authenticate, authController.refreshToken);

// Authenticated routes
router.post('/logout', authMiddleware.authenticate, authController.revokeToken);
router.post('/logout/:userId', authMiddleware.authenticate, authController.revokeToken);

// Add success route handler
router.get('/success', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ error: 'No token provided' });
  }
  
  // In development, redirect to the frontend with the token
  if (process.env.NODE_ENV === 'development') {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
  
  // For production, render a success page
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
          }
          h1 { color: #4CAF50; }
          .token {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Authentication Successful</h1>
          <p>You have successfully authenticated with Square.</p>
          <p>Your authentication token:</p>
          <div class="token">${token}</div>
          <p>You can now close this window and return to the application.</p>
        </div>
        <script>
          // Store token in localStorage
          localStorage.setItem('auth_token', '${token}');
          
          // If we're in a popup, send message to parent
          if (window.opener) {
            window.opener.postMessage({ type: 'AUTH_SUCCESS', token: '${token}' }, '*');
            window.close();
          }
        </script>
      </body>
    </html>
  `);
});

// Add verify endpoint
router.get('/square/verify', authMiddleware.authenticate, async (req, res) => {
  try {
    console.log('Verifying Square connection');
    console.log('User:', req.user);
    
    // For test tokens, return mock data
    if (req.user.merchant_id === 'TEST_MERCHANT_123') {
      console.log('Using mock data for test token');
      return res.json({
        status: 'success',
        connection: 'healthy',
        merchant: {
          locations: [{
            id: 'TEST_LOCATION_123',
            name: 'Test Location',
            status: 'ACTIVE',
            type: 'PHYSICAL',
            businessName: 'Test Square Business',
            country: 'US',
            currency: 'USD'
          }]
        },
        is_test: true
      });
    }
    
    // Get the access token from the user's merchant record
    const accessToken = req.user.square_access_token;
    
    if (!accessToken) {
      throw new Error('No Square access token found for user');
    }
    
    // Create Square client with the access token
    const client = getSquareClient(accessToken);
    
    // Try to list locations as a basic connectivity test
    const response = await client.locationsApi.listLocations();
    
    // Log the response
    console.log('Square API Response:', JSON.stringify(response.result, null, 2));
    
    // Return success with merchant details
    res.json({
      status: 'success',
      connection: 'healthy',
      merchant: {
        locations: response.result.locations.map(location => ({
          id: location.id,
          name: location.name,
          status: location.status,
          type: location.type,
          businessName: location.businessName,
          country: location.country,
          currency: location.currency
        }))
      },
      is_test: false
    });
  } catch (error) {
    console.error('Error verifying Square connection:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify Square connection',
      details: error.message
    });
  }
});

module.exports = router; 