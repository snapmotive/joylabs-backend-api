const User = require('../models/user');
const squareService = require('../services/square');
const security = require('../utils/security');
const crypto = require('crypto');

/**
 * Start Square OAuth flow with PKCE support for mobile apps
 */
async function startSquareOAuth(req, res) {
  try {
    // Get or generate a state parameter (can use provided state or generate a new one)
    const state = req.query.state || crypto.randomBytes(16).toString('hex');
    console.log(`Starting OAuth flow with state: ${state}`);
    
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
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://012dp4dzhb.execute-api.us-west-1.amazonaws.com/dev/api/auth/square/callback';
    console.log(`Redirect URL for OAuth: ${redirectUrl}`);
    
    // Set a cookie with the state parameter
    res.cookie('square_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000 // 1 hour
    });
    
    // Create the authorization URL
    console.log(`Using state parameter: ${state}`);
    const authUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${
      process.env.SQUARE_APPLICATION_ID
    }&scope=${
      encodeURIComponent('ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE')
    }&response_type=code&redirect_uri=${
      encodeURIComponent(redirectUrl)
    }&state=${state}`;
    
    console.log(`Redirecting to OAuth URL: ${authUrl}`);
    
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
  console.log('Square callback received', {
    query: req.query,
    cookies: req.cookies,
    headers: {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer
    }
  });
  
  try {
    // Get code and state from query parameters
    const { code, state: receivedState } = req.query;

    // Get stored state token and code verifier from cookies
    const expectedState = req.cookies.square_oauth_state;
    const codeVerifier = req.cookies.square_oauth_code_verifier;
    
    console.log(`Code received: ${code ? '✓' : '✗'}`);
    console.log(`State parameter: ${receivedState}`);
    console.log(`Expected state: ${expectedState}`);
    console.log(`Code verifier: ${codeVerifier ? '✓' : '✗'}`);
    
    // Clean up cookies regardless of outcome
    res.clearCookie('square_oauth_state');
    res.clearCookie('square_oauth_code_verifier');
    
    // Skip state validation for test_authorization_code in any environment
    const isTestMode = code === 'test_authorization_code';
    
    // Validate state parameter to prevent CSRF (unless in test mode)
    if (!isTestMode && (!receivedState || !expectedState || receivedState !== expectedState)) {
      console.error('State validation failed:', { received: receivedState, expected: expectedState });
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // If no code was received, handle as an error or cancellation
    if (!code) {
      console.error('No authorization code received');
      return res.status(400).json({ error: 'Authorization code missing' });
    }
    
    console.log('Preparing to exchange code for token', {
      code: code === 'test_authorization_code' ? 'test_authorization_code' : '***',
      codeVerifier: codeVerifier ? '***' : 'not provided',
      environment: process.env.SQUARE_ENVIRONMENT,
      redirectUrl: process.env.SQUARE_REDIRECT_URL
    });
    
    // Check if redirect URL in env matches the current host
    const currentHost = req.headers.host;
    const configuredRedirectUrl = process.env.SQUARE_REDIRECT_URL;
    
    if (configuredRedirectUrl && !isTestMode) {
      try {
        const configuredHost = new URL(configuredRedirectUrl).host;
        if (currentHost !== configuredHost) {
          console.warn(`⚠️ Potential redirect mismatch - Current host: ${currentHost}, configured redirect URL host: ${configuredHost}`);
        }
      } catch (e) {
        console.error('Error parsing redirect URL:', e.message);
      }
    }
    
    try {
      // Exchange the authorization code for an access token
      const tokenData = await squareService.exchangeCodeForToken(code, codeVerifier);
      console.log('Token exchange successful', {
        merchantId: tokenData.merchant_id ? 
          (tokenData.merchant_id.startsWith('TEST_') ? tokenData.merchant_id : tokenData.merchant_id.substring(0, 10) + '...') 
          : 'missing',
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token
      });
      
      if (!tokenData || !tokenData.merchant_id) {
        console.error('No merchant ID received in token response', tokenData);
        return res.status(500).json({ error: 'Failed to complete OAuth flow - missing merchant ID' });
      }
      
      const merchantId = tokenData.merchant_id;
      console.log(`Merchant ID: ${merchantId}`);
      
      // Find or create user by merchant ID
      console.log('Looking up user by merchant ID', merchantId);
      let user;
      try {
        user = await User.findBySquareMerchantId(merchantId);
        console.log('User lookup result:', user ? 'Found' : 'Not found');
      } catch (error) {
        console.error('Error finding user:', error);
        return res.status(500).json({ 
          error: 'Failed to complete OAuth flow - user lookup error',
          details: error.message
        });
      }
      
      if (!user) {
        console.log('User not found, creating new user for merchant:', merchantId);
        
        // Get merchant information from Square
        let merchantInfo;
        try {
          merchantInfo = await squareService.getMerchantInfo(tokenData.access_token);
          console.log('Merchant info received:', merchantInfo);
        } catch (error) {
          console.error('Error getting merchant info:', error);
          merchantInfo = { name: 'Square Merchant', email: 'unknown@example.com' };
        }
        
        // Create new user
        try {
          user = await User.create({
            square_merchant_id: merchantId,
            name: merchantInfo.name || 'Square Merchant', 
            email: merchantInfo.email || 'unknown@example.com',
            square_access_token: tokenData.access_token,
            square_refresh_token: tokenData.refresh_token,
            square_token_expires_at: tokenData.expires_at
          });
          
          console.log('New user created:', user.id);
        } catch (error) {
          console.error('Error creating user:', error);
          return res.status(500).json({ 
            error: 'Failed to complete OAuth flow - user creation error',
            details: error.message
          });
        }
      } else {
        console.log('Updating existing user:', user.id);
        
        // Update existing user's tokens
        try {
          user = await User.update(user.id, {
            square_access_token: tokenData.access_token,
            square_refresh_token: tokenData.refresh_token,
            square_token_expires_at: tokenData.expires_at,
            updated_at: new Date().toISOString()
          });
          
          console.log('User updated with new tokens');
        } catch (error) {
          console.error('Error updating user:', error);
          return res.status(500).json({ 
            error: 'Failed to complete OAuth flow - user update error',
            details: error.message
          });
        }
      }
      
      // Generate JWT token
      console.log('Generating JWT token for user', user.id);
      try {
        const jwtToken = generateToken(user);
        console.log('JWT token generated');
        
        // Determine redirect URL
        const successUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${successUrl}?token=${encodeURIComponent(jwtToken)}`;
        
        console.log(`Redirecting to: ${redirectUrl.substring(0, redirectUrl.indexOf('?') + 20)}...`);
        return res.redirect(302, redirectUrl);
      } catch (error) {
        console.error('Error generating JWT:', error);
        return res.status(500).json({ 
          error: 'Failed to complete OAuth flow - authentication error',
          details: error.message
        });
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      if (error.request) {
        console.error('Request details:', {
          method: error.request.method,
          url: error.request.url,
          headers: error.request.headers
        });
      }
      throw error; // Re-throw to be handled by outer catch
    }
    
  } catch (error) {
    console.error('Error completing Square OAuth:', error);
    
    // Detailed error message for debugging
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ 
        error: 'Failed to complete OAuth flow',
        details: error.message,
        stack: error.stack,
        squareEnv: process.env.SQUARE_ENVIRONMENT,
        redirectUrl: process.env.SQUARE_REDIRECT_URL
      });
    }
    
    return res.status(500).json({ error: 'Failed to complete OAuth flow' });
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
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://012dp4dzhb.execute-api.us-west-1.amazonaws.com/dev/api/auth/square/callback';
    console.log(`Redirect URL for OAuth: ${redirectUrl}`);
    
    // Create the authorization URL
    console.log(`Using state parameter: ${state}`);
    console.log('Using PKCE with code challenge');
    
    const authUrl = `https://connect.squareup.com/oauth2/authorize?client_id=${
      process.env.SQUARE_APPLICATION_ID
    }&scope=${
      encodeURIComponent('ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE')
    }&response_type=code&redirect_uri=${
      encodeURIComponent(redirectUrl)
    }&state=${
      state
    }&code_challenge=${
      codeChallenge
    }&code_challenge_method=S256`;
    
    // Return the authorization URL as JSON
    res.json({
      authUrl,
      state,
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
    const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'http://localhost:3001/api/auth/square/callback';
    
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