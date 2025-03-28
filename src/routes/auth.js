const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const squareService = require('../services/square');
const { generateOAuthUrl, exchangeCodeForToken, getMerchantInfo, getSquareClient } = require('../services/square');
const { generateStateParam, generateCodeVerifier, generateCodeChallenge } = require('../services/square');
const { createUser, findUserBySquareMerchantId, updateUser } = require('../models/user');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Create a temporary memory store for code verifiers
// Note: In production, consider using a database or Redis for persistence across instances
if (!global.codeVerifierStore) {
  global.codeVerifierStore = new Map();
}

// Create a temporary memory store for OAuth states
if (!global.oauthStates) {
  global.oauthStates = new Map();
}

// Initialize DynamoDB client
const dynamoDbClient = new DynamoDBClient({
  maxAttempts: 3,
  requestTimeout: 3000,
  ...(process.env.IS_OFFLINE === 'true' ? {
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  } : {})
});
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

// Endpoint to store code verifier with request_id
router.post('/store-verifier', async (req, res) => {
  try {
    const { request_id, code_verifier } = req.body;
    
    // Log request details
    console.log('Store verifier request received:', {
      hasRequestId: !!request_id,
      requestIdLength: request_id?.length || 0,
      hasCodeVerifier: !!code_verifier,
      codeVerifierLength: code_verifier?.length || 0,
      codeVerifierFirstChars: code_verifier ? code_verifier.substring(0, 5) : null,
      codeVerifierLastChars: code_verifier ? code_verifier.substring(code_verifier.length - 5) : null
    });
    
    // Validate required parameters
    if (!request_id) {
      console.error('Missing request_id in store-verifier request');
      return res.status(400).json({ error: 'Missing request_id parameter' });
    }
    
    if (!code_verifier) {
      console.error('Missing code_verifier in store-verifier request');
      return res.status(400).json({ error: 'Missing code_verifier parameter' });
    }
    
    // Validate code_verifier format (43-128 chars, URL-safe base64)
    if (code_verifier.length < 43 || code_verifier.length > 128) {
      console.error(`Invalid code_verifier length: ${code_verifier.length} (must be 43-128 characters)`);
      return res.status(400).json({ 
        error: 'Invalid code_verifier format', 
        details: `Length ${code_verifier.length} is outside valid range (43-128)`
      });
    }
    
    // Check characters are valid for URL-safe base64
    const validChars = /^[A-Za-z0-9\-._~]+$/;
    if (!validChars.test(code_verifier)) {
      console.error('Code verifier contains invalid characters');
      return res.status(400).json({ 
        error: 'Invalid code_verifier format', 
        details: 'Contains invalid characters (only A-Z, a-z, 0-9, -, ., _, ~ allowed)'
      });
    }
    
    // Store code_verifier with request_id (with TTL of 10 minutes)
    global.codeVerifierStore.set(request_id, {
      code_verifier,
      timestamp: Date.now(),
      ttl: 10 * 60 * 1000 // 10 minutes in milliseconds
    });
    
    console.log(`Code verifier stored successfully for request_id: ${request_id}`);
    
    // Clean up expired entries every time we add a new one
    cleanupExpiredCodeVerifiers();
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    res.status(500).json({ 
      error: 'Failed to store code verifier',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to clean up expired code verifiers
function cleanupExpiredCodeVerifiers() {
  const now = Date.now();
  let count = 0;
  
  for (const [request_id, data] of global.codeVerifierStore.entries()) {
    if (now - data.timestamp > data.ttl) {
      global.codeVerifierStore.delete(request_id);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`Cleaned up ${count} expired code verifiers`);
  }
}

// Square OAuth routes for web
router.get('/square', async (req, res) => {
  console.log('Starting Square OAuth flow');
  
  try {
    // Generate a secure state parameter
    const state = generateStateParam();
    console.log('Generated state parameter:', state);
    
    // Generate code verifier for PKCE flow
    const codeVerifier = generateCodeVerifier();
    console.log('Generated code verifier for PKCE flow');
    
    // Store state in memory for validation
    if (!global.oauthStates) {
      global.oauthStates = new Map();
    }
    
    // Clean up old states (older than 5 minutes)
    const now = Date.now();
    for (const [key, value] of global.oauthStates.entries()) {
      if (now - value.timestamp > 5 * 60 * 1000) {
        global.oauthStates.delete(key);
      }
    }
    
    // Store new state with timestamp and code verifier
    global.oauthStates.set(state, {
      timestamp: now,
      used: false,
      codeVerifier: codeVerifier
    });
    
    // Set code verifier in cookie for callback
    res.cookie('square_oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000, // 5 minutes
      sameSite: 'lax'
    });
    
    // Generate OAuth URL with the secure state and code verifier
    const url = await generateOAuthUrl(state, codeVerifier);
    console.log('Redirecting to Square OAuth URL');
    
    // Log details for debugging (with redacted values)
    console.log('OAuth request details:', {
      environment: 'production',
      state: state,
      code_verifier: codeVerifier.substring(0, 5) + '...',
      has_cookie: true
    });
    
    res.redirect(url);
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

// Handle callback from Square - support both GET and POST for Expo AuthSession
router.all('/square/callback', async (req, res) => {
  console.log('Square OAuth callback received');
  
  // Get parameters from either query (GET) or body (POST)
  const params = req.method === 'GET' ? req.query : req.body;
  
  // Log request details (redacting sensitive info)
  const redactedParams = { ...params };
  if (redactedParams.code) {
    redactedParams.code = redactedParams.code.substring(0, 5) + '...' + 
                         redactedParams.code.substring(redactedParams.code.length - 5);
  }
  if (redactedParams.code_verifier) {
    redactedParams.code_verifier = redactedParams.code_verifier.substring(0, 5) + '...' + 
                                  redactedParams.code_verifier.substring(redactedParams.code_verifier.length - 5);
  }
  console.log('Callback parameters:', redactedParams);
  
  try {
    // Extract parameters
    const { code, code_verifier, redirect_uri, state } = params;
    
    // Validate required parameters
    if (!code) {
      console.error('Missing authorization code');
      return res.status(400).json({ 
        error: 'Missing authorization code'
      });
    }
    
    // If state is provided, validate it
    if (state && global.oauthStates) {
      const storedState = global.oauthStates.get(state);
      if (!storedState) {
        console.error('Invalid or expired state parameter:', state);
        return res.status(400).json({ error: 'Invalid or expired state parameter' });
      }
      
      if (storedState.used) {
        console.error('State has already been used:', state);
        return res.status(400).json({ error: 'State has already been used' });
      }
      
      // Mark state as used
      storedState.used = true;
    }
    
    // Exchange code for token using Square SDK
    console.log('Exchanging code for token...');
    const tokenData = await exchangeCodeForToken(code, code_verifier, redirect_uri);
    
    // Get merchant information
    console.log('Getting merchant information...');
    const merchantInfo = await getMerchantInfo(tokenData.access_token);
    
    // Find or create user
    let user = await findUserBySquareMerchantId(merchantInfo.merchant_id);
    
    if (!user) {
      user = await createUser({
        squareMerchantId: merchantInfo.merchant_id,
        merchantInfo,
        tokens: tokenData
      });
    } else {
      await updateUser(user.id, {
        merchantInfo,
        tokens: tokenData
      });
    }
    
    // Generate JWT
    const jwtToken = jwt.sign(
      { 
        userId: user.id,
        merchantId: merchantInfo.merchant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Clean up used state
    if (state && global.oauthStates) {
      global.oauthStates.delete(state);
    }
    
    // Return JSON response for both web and mobile clients
    res.json({
      access_token: tokenData.access_token,
      merchant_id: merchantInfo.merchant_id,
      merchant_name: merchantInfo.business_name,
      jwt_token: jwtToken
    });
  } catch (error) {
    console.error('Error in Square callback:', error);
    res.status(500).json({ 
      error: 'Failed to exchange token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Square OAuth route for mobile
router.get('/square/mobile-init', async (req, res) => {
  console.log('Mobile OAuth initialized with Expo AuthSession');
  
  try {
    // Get Square credentials
    const credentials = await squareService.getSquareCredentials();
    
    if (!credentials || !credentials.applicationId) {
      throw new Error('Failed to get Square application ID');
    }
    
    console.log('Using Square Application ID:', credentials.applicationId);
    
    // Generate a state parameter
    const state = generateStateParam();
    console.log(`Mobile OAuth initialized with state: ${state}`);
    
    // Store state in DynamoDB
    const command = new PutCommand({
      TableName: process.env.DYNAMODB_STATES_TABLE,
      Item: {
        state,
        createdAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes TTL
      }
    });
    
    await docClient.send(command);
    
    // Generate the authorization URL for Square
    const baseUrl = 'https://connect.squareup.com/oauth2/authorize';
    const params = new URLSearchParams({
      client_id: credentials.applicationId,
      response_type: 'code',
      scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE INVENTORY_READ INVENTORY_WRITE',
      state: state,
      redirect_uri: process.env.SQUARE_REDIRECT_URL || 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback'
    });
    
    const authUrl = `${baseUrl}?${params.toString()}`;
    console.log('Generated auth URL for mobile client');
    
    // Return the authorization URL and state
    res.json({
      url: authUrl,
      state
    });
  } catch (error) {
    console.error('Error initiating mobile OAuth:', error);
    res.status(500).json({
      error: 'Failed to initiate OAuth process',
      details: error.message
    });
  }
});

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
router.post('/refresh', authMiddleware.authenticate, (req, res) => {
  // Implementation of refresh token endpoint
});

// Authenticated routes
router.post('/logout', authMiddleware.authenticate, (req, res) => {
  // Implementation of logout endpoint
});
router.post('/logout/:userId', authMiddleware.authenticate, (req, res) => {
  // Implementation of logout endpoint
});

// Add success route handler
router.get('/success', (req, res) => {
  // Implementation of success route handler
});

// Add verify endpoint
router.get('/square/verify', authMiddleware.authenticate, async (req, res) => {
  // Implementation of verify endpoint
});

// Add a specific endpoint for token exchange that expects code_verifier in the body
router.post('/token-exchange', async (req, res) => {
  // Implementation of token exchange endpoint
});

// Add a new endpoint to register tokens obtained directly from Square by the frontend
router.post('/register-token', async (req, res) => {
  // Implementation of register token endpoint
});

// Register state endpoint for OAuth flow
router.post('/register-state', async (req, res) => {
  console.log('Received state registration request:', {
    body: req.body,
    headers: req.headers
  });

  try {
    const { state } = req.body;

    if (!state) {
      console.error('Missing state parameter in request body');
      return res.status(400).json({ error: 'Missing state parameter' });
    }

    // Store state in memory with timestamp
    global.oauthStates.set(state, {
      timestamp: Date.now(),
      used: false
    });

    // Clean up old states (older than 5 minutes)
    const now = Date.now();
    for (const [key, value] of global.oauthStates.entries()) {
      if (now - value.timestamp > 5 * 60 * 1000) {
        global.oauthStates.delete(key);
      }
    }

    console.log(`State ${state} registered successfully`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error registering state:', error);
    res.status(500).json({ 
      error: 'Failed to register state',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Generate Square OAuth URL endpoint
router.get('/connect/url', async (req, res) => {
  console.log('Received OAuth URL request:', {
    query: req.query,
    headers: req.headers
  });

  try {
    const { state, code_challenge, redirect_uri } = req.query;

    // Validate required parameters
    if (!state || !code_challenge || !redirect_uri) {
      console.error('Missing required parameters:', { state, code_challenge, redirect_uri });
      return res.status(400).json({
        error: 'Missing required parameters',
        details: 'state, code_challenge, and redirect_uri are required'
      });
    }

    // Store state in memory with timestamp
    global.oauthStates.set(state, {
      timestamp: Date.now(),
      used: false,
      redirect_uri
    });

    // Clean up old states (older than 5 minutes)
    const now = Date.now();
    for (const [key, value] of global.oauthStates.entries()) {
      if (now - value.timestamp > 5 * 60 * 1000) {
        global.oauthStates.delete(key);
      }
    }

    const url = await squareService.generateOAuthUrl(state, code_challenge, redirect_uri);
    console.log('Generated Square OAuth URL');
    res.json({ url });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({
      error: 'Failed to generate OAuth URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export the router
module.exports = router; 