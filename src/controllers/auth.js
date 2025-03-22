const User = require('../models/user');
const squareService = require('../services/square');
const security = require('../utils/security');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');

// Initialize DynamoDB client
const dynamoDb = process.env.IS_OFFLINE === 'true'
  ? new AWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  : new AWS.DynamoDB.DocumentClient();

const STATE_TTL = 5 * 60; // 5 minutes in seconds

/**
 * Store OAuth state parameter in DynamoDB
 */
const storeState = async (state) => {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const params = {
    TableName: process.env.SESSIONS_TABLE,
    Item: {
      id: `oauth_state_${state}`,
      state,
      created_at: now,
      expires: now + STATE_TTL // TTL in seconds from epoch
    }
  };

  console.log('Storing state parameter:', {
    state,
    expires_in: STATE_TTL,
    expires_at: new Date((now + STATE_TTL) * 1000).toISOString()
  });

  await dynamoDb.put(params).promise();
};

/**
 * Validate and consume OAuth state parameter from DynamoDB
 */
const validateAndConsumeState = async (state) => {
  console.log('Validating state parameter:', state);
  
  if (!state || typeof state !== 'string' || state.length < 32) {
    console.error('Invalid state parameter format');
    return false;
  }

  const params = {
    TableName: process.env.SESSIONS_TABLE,
    Key: {
      id: `oauth_state_${state}`
    }
  };

  try {
    const result = await dynamoDb.get(params).promise();
    
    if (!result.Item) {
      console.error('State parameter not found in DynamoDB');
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (result.Item.expires < now) {
      console.error('State parameter has expired', {
        expired_at: new Date(result.Item.expires * 1000).toISOString(),
        current_time: new Date(now * 1000).toISOString()
      });
      return false;
    }

    // Delete the state to prevent reuse
    await dynamoDb.delete(params).promise();
    console.log('State parameter validated and consumed successfully');
    return true;
  } catch (error) {
    console.error('Error validating state parameter:', error);
    return false;
  }
};

/**
 * Start Square OAuth flow with PKCE support for mobile apps
 */
async function startSquareOAuth(req, res) {
  try {
    // Get Square credentials
    const credentials = await squareService.getSquareCredentials();
    
    if (!credentials || !credentials.applicationId) {
      throw new Error('Failed to get Square application ID');
    }
    
    console.log('Using Square Application ID:', credentials.applicationId);
    
    const state = req.query.state || await generateStateParam();
    console.log('Generated state parameter:', state);
    
    // Store state in DynamoDB
    await storeState(state);
    
    // Log important request details for debugging
    console.log(`Request from User-Agent: ${req.headers['user-agent']}`);
    console.log(`Request from Origin: ${req.headers.origin}`);
    
    // Log OAuth activity for monitoring
    console.log('OAuth Activity:', JSON.stringify({
      action: 'oauth_start',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      using_pkce: false
    }));
    
    // Get the redirect URL from configuration
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://ux8uq7hd24.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback';
    console.log(`Redirect URL for OAuth: ${redirectUrl}`);
    
    // Create the authorization URL
    console.log(`Using state parameter: ${state}`);
    const authUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${
      credentials.applicationId
    }&scope=${
      encodeURIComponent('ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE')
    }&response_type=code&redirect_uri=${
      encodeURIComponent(redirectUrl)
    }&state=${state}`;
    
    // Log the generated URL (with truncated values for security)
    const logUrl = authUrl.replace(credentials.applicationId, credentials.applicationId.substring(0, 10) + '...');
    console.log(`Redirecting to OAuth URL: ${logUrl}`);
    
    // Redirect to the authorization URL
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error starting Square OAuth:', error);
    res.status(500).json({
      error: 'Failed to start OAuth process',
      details: error.message
    });
  }
}

/**
 * Handle Square OAuth callback
 */
async function handleSquareCallback(req, res) {
  console.log('Handling Square OAuth callback');
  console.log('Query parameters:', req.query);
  console.log('Headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    'user-agent': req.headers['user-agent']
  });
  
  const { code, state } = req.query;
  
  if (!code || !state) {
    console.error('Missing required parameters:', { code: !!code, state: !!state });
    return res.status(400).json({ 
      error: 'Missing required parameters',
      details: {
        code: !code ? 'Missing authorization code' : undefined,
        state: !state ? 'Missing state parameter' : undefined
      }
    });
  }
  
  try {
    // Validate state parameter
    console.log('Validating state parameter:', state);
    const isValidState = await validateAndConsumeState(state);
    if (!isValidState) {
      console.error('Invalid state parameter:', state);
      return res.status(400).json({ 
        error: 'Invalid state parameter',
        details: 'The state parameter is invalid, expired, or has already been used'
      });
    }
    
    console.log('State parameter validated successfully');
    
    // Exchange code for token
    console.log('Exchanging authorization code for token');
    const tokenResponse = await squareService.exchangeCodeForToken(code);
    console.log('Token exchange successful');
    
    // Get merchant information
    console.log('Getting merchant information');
    const merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
    console.log('Merchant info retrieved:', {
      business_name: merchantInfo.businessName,
      merchant_id: tokenResponse.merchant_id
    });
    
    // Find or create user
    console.log('Finding or creating user');
    const userId = `user-${tokenResponse.merchant_id}`;
    let user = await User.findBySquareMerchantId(tokenResponse.merchant_id);
    
    if (!user) {
      console.log('Creating new user for merchant:', tokenResponse.merchant_id);
      user = await User.create({
        id: userId,
        name: merchantInfo.businessName || 'Square Merchant',
        email: merchantInfo.email || `${tokenResponse.merchant_id}@example.com`,
        square_merchant_id: tokenResponse.merchant_id
      });
      console.log('New user created:', user.id);
    } else {
      console.log('Found existing user:', user.id);
    }
    
    // Update user with new tokens
    console.log('Updating user with new tokens');
    await User.update(user.id, {
      square_access_token: tokenResponse.access_token,
      square_refresh_token: tokenResponse.refresh_token,
      square_token_expires_at: tokenResponse.expires_at
    });
    console.log('User tokens updated successfully');
    
    // Generate JWT token
    const token = jwt.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
      merchant_id: tokenResponse.merchant_id
    }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    
    // Redirect to success page with token
    const redirectUrl = `${process.env.API_BASE_URL}/auth/success?token=${token}`;
    console.log('Redirecting to success page:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Square callback:', error);
    console.error('Stack trace:', error.stack);
    
    // Determine if it's a Square API error
    const isSquareError = error.response?.data?.errors;
    const errorMessage = isSquareError 
      ? error.response.data.errors[0].detail
      : error.message;
    
    res.status(500).json({
      error: 'Failed to complete OAuth flow',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      type: isSquareError ? 'square_api_error' : 'internal_error'
    });
  }
}

/**
 * Success page after OAuth completion
 */
async function oauthSuccess(req, res) {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Authentication token is missing' });
    }
    
    // Render a success page with the token and instructions
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Authentication Success</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 650px;
              margin: 0 auto;
              padding: 20px;
            }
            .card {
              background: #fff;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              padding: 20px;
              margin: 40px 0;
            }
            h1 { color: #4CAF50; }
            .token {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 4px;
              overflow-wrap: break-word;
              word-wrap: break-word;
              word-break: break-all;
              margin: 15px 0;
              font-family: monospace;
              font-size: 14px;
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
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Authentication Successful!</h1>
            <p>Your Square account has been successfully connected. You can now close this window and return to the app.</p>
            <h2>Your authentication token:</h2>
            <div class="token">${token}</div>
            <p>Copy this token and use it to authenticate in the mobile app, or click the button below if you're opening this page from the app.</p>
            <a href="joylabs://auth/callback?token=${token}" class="button">Open in App</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering success page:', error);
    res.status(500).json({ error: 'Failed to render success page' });
  }
}

/**
 * Refresh tokens using refresh token
 */
async function refreshToken(req, res) {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // Call Square API to refresh the token
    const refreshData = await squareService.refreshToken(refresh_token);
    
    // Update user record with new tokens
    if (req.user && req.user.id) {
      await User.update(req.user.id, {
        square_access_token: refreshData.access_token,
        square_refresh_token: refreshData.refresh_token,
        square_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      });
    }
    
    // Log token refresh
    await security.logOAuthActivity({
      action: 'token_refresh',
      user_id: req.user?.id,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    // Return new tokens
    return res.json(refreshData);
  } catch (error) {
    console.error('Error refreshing token:', error);
    
    // Log refresh failure
    await security.logAuthFailure({
      reason: 'refresh_failed',
      user_id: req.user?.id,
      ip: req.ip,
      error: error.message,
      user_agent: req.headers['user-agent']
    });
    
    return res.status(401).json({ error: 'Failed to refresh token' });
  }
}

/**
 * Revoke Square OAuth token and log the user out
 */
async function revokeToken(req, res) {
  try {
    // Get user ID from params (web flow) or auth token (mobile flow)
    const userId = req.params.userId || req.user.id;
    
    // Fetch the user
    const user = await User.findById(userId);
    
    if (!user) {
      await security.logTokenRevocation({
        action: 'revoke_attempt',
        requested_user_id: userId,
        requester_id: req.user?.id,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failed',
        reason: 'user_not_found'
      });
      
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if the requesting user has permission to revoke this token
    if (req.user.id !== userId && !req.user.isAdmin) {
      await security.logTokenRevocation({
        action: 'revoke_attempt',
        requested_user_id: userId,
        requester_id: req.user.id,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failed',
        reason: 'unauthorized'
      });
      
      return res.status(403).json({ error: 'Unauthorized to revoke this token' });
    }
    
    // Revoke token with Square
    if (user.square_access_token) {
      await squareService.revokeToken(user.square_access_token);
    }
    
    // Update user record to clear tokens
    await User.update(userId, {
      square_access_token: null,
      square_refresh_token: null,
      square_token_expires_at: null
    });
    
    // Log successful revocation
    await security.logTokenRevocation({
      action: 'revoke_success',
      user_id: userId,
      requester_id: req.user.id,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });
    
    res.json({ success: true, message: 'Token revoked successfully' });
  } catch (error) {
    console.error('Error revoking token:', error);
    
    await security.logTokenRevocation({
      action: 'revoke_attempt',
      requested_user_id: req.params.userId,
      requester_id: req.user?.id,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'failed',
      reason: error.message
    });
    
    res.status(500).json({ error: 'Failed to revoke token' });
  }
}

/**
 * Initialize OAuth for mobile apps
 * This endpoint generates state and PKCE parameters and returns them to the mobile app
 */
async function initMobileOAuth(req, res) {
  console.log('Mobile OAuth initialized');
  
  try {
    // Get Square credentials first
    const squareService = require('../services/square');
    const credentials = await squareService.getSquareCredentials();
    
    if (!credentials || !credentials.applicationId) {
      throw new Error('Failed to get Square application ID');
    }
    
    console.log('Using Square Application ID:', credentials.applicationId);
    
    // Generate a state parameter
    const state = crypto.randomBytes(16).toString('hex');
    console.log(`Mobile OAuth initialized with state: ${state}`);
    
    // Generate a code verifier and challenge for PKCE
    const codeVerifier = crypto.randomBytes(64).toString('hex');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Store the code verifier in the session
    if (!req.session) {
      req.session = {};
    }
    
    if (!req.session.oauthParams) {
      req.session.oauthParams = {};
    }
    
    req.session.oauthParams[state] = {
      codeVerifier,
      createdAt: new Date().toISOString()
    };
    
    // Set a cookie with the state parameter for browsers
    // This ensures that both API clients and browsers can work
    res.cookie('square_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    // Get the redirect URL from configuration
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://ux8uq7hd24.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback';
    console.log(`Redirect URL for OAuth: ${redirectUrl}`);
    
    // Create the authorization URL
    console.log(`Using state parameter: ${state}`);
    console.log('Using PKCE with code challenge');
    
    const authUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${
      credentials.applicationId
    }&scope=${
      encodeURIComponent('ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE')
    }&response_type=code&redirect_uri=${
      encodeURIComponent(redirectUrl)
    }&state=${
      state
    }&code_challenge=${
      codeChallenge
    }&code_challenge_method=S256`;
    
    // Log the generated URL (with truncated values for security)
    const logUrl = authUrl.replace(credentials.applicationId, credentials.applicationId.substring(0, 10) + '...');
    console.log('Generated auth URL:', logUrl);
    
    // Return the authorization URL as JSON
    res.json({
      authUrl,
      state,
      codeVerifier, // Only for testing - remove in production
      pkce: true
    });
  } catch (error) {
    console.error('Error initiating mobile OAuth:', error);
    res.status(500).json({
      error: 'Failed to initiate OAuth process',
      details: error.message
    });
  }
}

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  console.log('Generating token for user:', user.id);
  
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'testing123';
  const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';
  
  // Create the payload with user information (never include sensitive data)
  const payload = {
    sub: user.id,
    merchantId: user.square_merchant_id,
    name: user.name,
    email: user.email,
    iat: Math.floor(Date.now() / 1000)
  };
  
  // Generate the token
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

exports.showTestPage = (req, res) => {
  try {
    const appId = process.env.SQUARE_APPLICATION_ID;
    const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://ux8uq7hd24.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback';
    
    // Mask sensitive data for display
    const maskedAppId = appId ? `${appId.substring(0, 4)}...${appId.substring(appId.length - 4)}` : 'Not configured';
    const secretConfigured = process.env.SQUARE_APPLICATION_SECRET ? 'Configured ✅' : 'Not configured ❌';
    
    console.log('Square OAuth test tool accessed');
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Square OAuth Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #4A154B; }
          h2 { color: #4A154B; margin-top: 30px; }
          .card { border: 1px solid #ddd; border-radius: 4px; padding: 20px; margin-bottom: 20px; background: #f9f9f9; }
          .btn { display: inline-block; background: #4A154B; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
          .btn:hover { background: #611f64; }
          .error { color: #D40E0D; }
          .success { color: #008000; }
          table { width: 100%; border-collapse: collapse; }
          table, th, td { border: 1px solid #ddd; }
          th, td { padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          pre { background: #f4f4f4; padding: 10px; overflow: auto; }
          code { font-family: monospace; }
          .test-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Square OAuth Test Tool</h1>
        
        <div class="card">
          <h2>Environment Configuration</h2>
          <table>
            <tr>
              <th>Setting</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Environment</td>
              <td>${environment}</td>
            </tr>
            <tr>
              <td>Application ID</td>
              <td>${maskedAppId}</td>
            </tr>
            <tr>
              <td>Application Secret</td>
              <td>${secretConfigured}</td>
            </tr>
            <tr>
              <td>Redirect URL</td>
              <td>${redirectUrl}</td>
            </tr>
          </table>
        </div>
        
        <div class="card">
          <h2>Test OAuth Flow</h2>
          <p>Click the button below to test the full OAuth flow:</p>
          <a href="/api/auth/square?state=test-state-parameter" class="btn">Start OAuth Flow</a>
          
          <div class="test-actions">
            <a href="/api/auth/square/mobile-init" class="btn" target="_blank">Test Mobile Init</a>
            <a href="/api/auth/square/set-test-cookie" class="btn">Set Test Cookies</a>
          </div>
        </div>
        
        <div class="card">
          <h2>Test Security</h2>
          <p>Use this test callback for local testing:</p>
          <a href="/api/auth/square/test-callback" class="btn">Test Callback Locally</a>
        </div>
        
        <div class="card">
          <h2>Documentation</h2>
          <p>For more information, see the Square OAuth documentation:</p>
          <ul>
            <li><a href="https://developer.squareup.com/docs/oauth-api/overview" target="_blank">Square OAuth API Overview</a></li>
            <li><a href="https://developer.squareup.com/docs/oauth-api/testing" target="_blank">Testing Square OAuth</a></li>
          </ul>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error showing test page:', error);
    res.status(500).json({ error: 'Failed to load test page' });
  }
};

// Export the controller functions
module.exports = {
  startSquareOAuth,
  handleSquareCallback,
  oauthSuccess,
  revokeToken,
  initMobileOAuth,
  refreshToken
}; 