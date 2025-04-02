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
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SquareClient } = require('square');

/**
 * IMPORTANT: This is the primary implementation of the Square OAuth flow.
 * The duplicate implementation in oauthHandlers.js is maintained for backward 
 * compatibility but will be removed in a future version.
 * 
 * All new OAuth functionality should be added here rather than in oauthHandlers.js.
 */

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
    
    // Store state in DynamoDB with TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes
    const params = {
      TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
      Item: {
        state: state,
        timestamp: Date.now(),
        used: false,
        ttl: ttl,
        code_verifier: codeVerifier,
        redirectUrl: 'joylabs://square-callback'
      }
    };

    console.log('Storing state in DynamoDB:', {
      tableName: params.TableName,
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      ttl: new Date(ttl * 1000).toISOString()
    });

    const result = await docClient.send(new PutCommand(params));
    
    console.log('DynamoDB PutCommand result:', {
      statusCode: result.$metadata.httpStatusCode,
      requestId: result.$metadata.requestId
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

/**
 * Handle Square OAuth callback
 * Receives the callback from Square, exchanges code for token, then redirects to mobile app
 */
router.get('/square/callback', async (req, res) => {
  try {
    const { code, state, error, app_callback } = req.query;
    
    console.log('Square callback received:', {
      hasCode: !!code,
      state,
      hasError: !!error,
      app_callback,
      STATES_TABLE: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
      headers: req.headers,
      query: req.query
    });
    
    if (error) {
      console.error('Error from Square:', error);
      return res.redirect(`joylabs://square-callback?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.error('No code provided in Square callback');
      return res.redirect('joylabs://square-callback?error=missing_code');
    }

    if (!state) {
      console.error('No state provided in Square callback');
      return res.redirect('joylabs://square-callback?error=missing_state');
    }

    // Retrieve state data from DynamoDB
    const getStateParams = {
      TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
      Key: {
        state: state
      }
    };

    console.log('Retrieving state data from DynamoDB:', {
      tableName: getStateParams.TableName,
      state: state
    });

    try {
      const result = await docClient.send(new GetCommand(getStateParams));
      
      if (!result.Item) {
        console.error('No state data found in DynamoDB');
        return res.redirect('joylabs://square-callback?error=invalid_state');
      }
      
      console.log('Retrieved state data from DynamoDB');
      
      const stateData = result.Item;
      
      // Check if state has already been used
      if (stateData.used) {
        console.error('State has already been used');
        return res.redirect('joylabs://square-callback?error=state_already_used');
      }
      
      // Get code verifier from state data
      const codeVerifier = stateData.code_verifier;
      const redirectUrl = stateData.redirectUrl || 'joylabs://square-callback';
      
      if (!codeVerifier) {
        console.error('No code verifier found for state');
        
        // Check if we're dealing with a non-PKCE flow (for backward compatibility)
        if (stateData.code_challenge) {
          return res.redirect(`${redirectUrl}?error=missing_code_verifier&details=code_challenge_exists`);
        }

        // Try to proceed without code verifier (may work for non-PKCE flows)
        try {
          // Exchange code for tokens without code verifier
          const tokenResponse = await squareService.exchangeCodeForToken(code);
          console.log('Successfully exchanged code for tokens without PKCE');

          // Mark state as used
          const updateParams = {
            TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
            Key: {
              state: state
            },
            UpdateExpression: 'set used = :used',
            ExpressionAttributeValues: {
              ':used': true
            }
          };

          await docClient.send(new UpdateCommand(updateParams));
          console.log('Marked state as used in DynamoDB');

          // Get merchant info using the access token - try native fetch first for better security
          let merchantInfo;
          try {
            // Use native fetch implementation first (Node.js 22 feature)
            merchantInfo = await squareService.getMerchantInfoWithFetch(tokenResponse.access_token);
            console.log('Retrieved merchant info using native fetch API');
          } catch (fetchError) {
            // Fall back to SDK implementation if fetch fails
            console.warn('Fetch API failed for merchant info, falling back to SDK:', fetchError.message);
            merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
            console.log('Retrieved merchant info using Square SDK');
          }
          
          console.log('Retrieved merchant info');

          // Build the redirect URL with all necessary parameters - using manual construction for better Safari compatibility
          const sanitizedBusinessName = encodeURIComponent(merchantInfo.businessName || '');
          const finalRedirectUrl = `joylabs://square-callback?access_token=${encodeURIComponent(tokenResponse.access_token)}&refresh_token=${encodeURIComponent(tokenResponse.refresh_token)}&merchant_id=${encodeURIComponent(tokenResponse.merchant_id)}&business_name=${sanitizedBusinessName}`;

          // Debug logging for redirect URL
          console.log('DEBUG - Redirect URL details:', {
            baseUrl: redirectUrl,
            finalUrl: finalRedirectUrl,
            manuallyConstructed: true,
            params: {
              access_token: `${tokenResponse.access_token.substring(0, 5)}...${tokenResponse.access_token.substring(tokenResponse.access_token.length - 5)}`,
              refresh_token: `${tokenResponse.refresh_token.substring(0, 5)}...${tokenResponse.refresh_token.substring(tokenResponse.refresh_token.length - 5)}`,
              merchant_id: tokenResponse.merchant_id,
              business_name: merchantInfo.businessName
            }
          });

          console.log('Redirecting to app with tokens:', {
            redirectUrl: finalRedirectUrl.substring(0, 30) + '...'
          });
          return res.redirect(finalRedirectUrl);
        } catch (error) {
          console.error('Error in non-PKCE flow:', error);
          return res.redirect(`${redirectUrl}?error=token_exchange_failed&details=non_pkce_failed&message=${encodeURIComponent(error.message)}`);
        }
      }

      try {
        // Exchange code for tokens
        const tokenResponse = await squareService.exchangeCodeForToken(code, codeVerifier);
        console.log('Successfully exchanged code for tokens');

        // Mark state as used
        const updateParams = {
          TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
          Key: {
            state: state
          },
          UpdateExpression: 'set used = :used',
          ExpressionAttributeValues: {
            ':used': true
          }
        };

        await docClient.send(new UpdateCommand(updateParams));
        console.log('Marked state as used in DynamoDB');

        // Get merchant info using the access token - try native fetch first for better security
        let merchantInfo;
        try {
          // Use native fetch implementation first (Node.js 22 feature)
          merchantInfo = await squareService.getMerchantInfoWithFetch(tokenResponse.access_token);
          console.log('Retrieved merchant info using native fetch API');
        } catch (fetchError) {
          // Fall back to SDK implementation if fetch fails
          console.warn('Fetch API failed for merchant info, falling back to SDK:', fetchError.message);
          merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
          console.log('Retrieved merchant info using Square SDK');
        }
        
        console.log('Retrieved merchant info');

        // Build the redirect URL with all necessary parameters - using manual construction for better Safari compatibility
        const sanitizedBusinessName = encodeURIComponent(merchantInfo.businessName || '');
        const finalRedirectUrl = `joylabs://square-callback?access_token=${encodeURIComponent(tokenResponse.access_token)}&refresh_token=${encodeURIComponent(tokenResponse.refresh_token)}&merchant_id=${encodeURIComponent(tokenResponse.merchant_id)}&business_name=${sanitizedBusinessName}`;

        // Debug logging for redirect URL
        console.log('DEBUG - Redirect URL details:', {
          baseUrl: redirectUrl,
          finalUrl: finalRedirectUrl,
          manuallyConstructed: true,
          params: {
            access_token: `${tokenResponse.access_token.substring(0, 5)}...${tokenResponse.access_token.substring(tokenResponse.access_token.length - 5)}`,
            refresh_token: `${tokenResponse.refresh_token.substring(0, 5)}...${tokenResponse.refresh_token.substring(tokenResponse.refresh_token.length - 5)}`,
            merchant_id: tokenResponse.merchant_id,
            business_name: merchantInfo.businessName
          }
        });

        console.log('Redirecting to app with tokens:', {
          redirectUrl: finalRedirectUrl.substring(0, 30) + '...'
        });
        return res.redirect(finalRedirectUrl);
      } catch (error) {
        console.error('Error exchanging code for token:', error);
        return res.redirect(`${redirectUrl}?error=token_exchange_failed&message=${encodeURIComponent(error.message)}`);
      }
    } catch (dbError) {
      console.error('Error retrieving state from DynamoDB:', dbError);
      return res.redirect('joylabs://square-callback?error=database_error');
    }
  } catch (error) {
    console.error('Error in Square callback:', error);
    return res.redirect('joylabs://square-callback?error=server_error');
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
    const { state, redirectUrl, code_verifier, code_challenge } = req.body;

    if (!state) {
      console.error('Missing state parameter in request body');
      return res.status(400).json({ error: 'Missing state parameter' });
    }
    
    // Store state in DynamoDB with TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes
    const params = {
      TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
      Item: {
        state: state,
        timestamp: Date.now(),
        used: false,
        ttl: ttl,
        redirectUrl: redirectUrl || 'joylabs://square-callback'
      }
    };

    // Add code_verifier if provided
    if (code_verifier) {
      params.Item.code_verifier = code_verifier;
      console.log('Code verifier included in state registration');
    } else if (code_challenge) {
      // If we have a code challenge but no verifier, we're using separate PKCE steps
      params.Item.code_challenge = code_challenge;
      console.log('Code challenge included in state registration');
    } else {
      console.warn('No code_verifier or code_challenge provided for PKCE flow');
    }

    console.log('Storing state in DynamoDB:', {
      tableName: params.TableName,
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      ttl: new Date(ttl * 1000).toISOString(),
      hasCodeVerifier: !!code_verifier,
      hasCodeChallenge: !!code_challenge
    });

    const result = await docClient.send(new PutCommand(params));
    
    console.log('DynamoDB PutCommand result:', {
      statusCode: result.$metadata.httpStatusCode,
      requestId: result.$metadata.requestId
    });

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
    const { state, code_challenge, code_verifier, redirect_uri } = req.query;
    
    // Validate required parameters
    if (!state || !code_challenge || !redirect_uri) {
      console.error('Missing required parameters:', { state, code_challenge, redirect_uri });
        return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'state, code_challenge, and redirect_uri are required'
      });
    }

    // Validate redirect_uri format for deep linking
    if (!redirect_uri.startsWith('joylabs://')) {
      console.error('Invalid redirect_uri format:', redirect_uri);
        return res.status(400).json({ 
        error: 'Invalid redirect_uri',
        details: 'redirect_uri must start with joylabs://'
      });
    }

    // Store state in DynamoDB with TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes
    const params = {
      TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
      Item: {
        state: state,
        timestamp: Date.now(),
        used: false,
        ttl: ttl,
        code_challenge: code_challenge,
        redirect_uri: redirect_uri
      }
    };

    // Store code_verifier if provided (for PKCE)
    if (code_verifier) {
      params.Item.code_verifier = code_verifier;
      console.log('Added code_verifier to state storage');
    }

    console.log('Storing state in DynamoDB:', {
      tableName: params.TableName,
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      ttl: new Date(ttl * 1000).toISOString(),
      hasCodeChallenge: true,
      hasCodeVerifier: !!code_verifier
    });

    const result = await docClient.send(new PutCommand(params));
    
    console.log('DynamoDB PutCommand result:', {
      statusCode: result.$metadata.httpStatusCode,
      requestId: result.$metadata.requestId
    });

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

/**
 * Generate PKCE code verifier and challenge for OAuth flow
 * Uses secure WebCrypto API with fallback to legacy implementation
 */
router.post('/generate-pkce', async (req, res) => {
  try {
    // Generate PKCE code verifier
    const codeVerifier = await squareService.generateCodeVerifier();
    
    // Generate code challenge from verifier
    const codeChallenge = await squareService.generateCodeChallenge(codeVerifier);
    
    // Return both to the client
    res.json({
      code_verifier: codeVerifier,
      code_challenge: codeChallenge
    });
  } catch (error) {
    console.error('Error generating PKCE codes:', error);
    res.status(500).json({ 
      error: 'Failed to generate PKCE codes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export the router
module.exports = router; 