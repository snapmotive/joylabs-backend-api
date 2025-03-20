const User = require('../models/user');
const squareService = require('../services/square');
const security = require('../utils/security');

/**
 * Start Square OAuth flow with PKCE support for mobile apps
 */
async function startSquareOAuth(req, res) {
  try {
    // Check if a state was passed in the request (for mobile apps)
    const state = req.query.state || squareService.generateStateParam();
    
    console.log('Starting OAuth flow with state:', state);
    console.log('Request from User-Agent:', req.headers['user-agent']);
    console.log('Request from Origin:', req.headers.origin);
    
    // Generate PKCE code verifier and challenge if client indicates it supports PKCE
    let codeVerifier = null;
    let codeChallenge = null;
    
    if (req.query.pkce === 'true') {
      codeVerifier = squareService.generateCodeVerifier();
      codeChallenge = squareService.generateCodeChallenge(codeVerifier);
      
      // Store the code verifier in a cookie for later verification
      // Mobile apps may not support cookies, so we'll need a different approach
      res.cookie('square_code_verifier', codeVerifier, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'none', // Allow cross-site cookies for OAuth flow
        path: '/'
      });
      
      // Log PKCE usage for security monitoring
      await security.logOAuthActivity({
        action: 'oauth_start',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        using_pkce: true
      });
    } else {
      // Log non-PKCE OAuth start for security monitoring
      await security.logOAuthActivity({
        action: 'oauth_start',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        using_pkce: false
      });
    }
    
    // Store the state in cookie for validation later
    res.cookie('square_oauth_state', state, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: 'none', // Allow cross-site cookies for OAuth flow
      path: '/'
    });
    
    // For mobile apps, we'll also need to add the state to the session or other storage
    if (req.session) {
      req.session.square_oauth_state = state;
    }
    
    // Generate the authorization URL with the state parameter and code challenge if available
    const authUrl = await squareService.getAuthorizationUrl(state, codeChallenge);
    
    console.log('Redirecting to OAuth URL:', authUrl);
    
    // Redirect the user to Square's OAuth page
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error starting Square OAuth flow:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
}

/**
 * Handle Square OAuth callback
 */
async function handleSquareCallback(req, res) {
  try {
    // Check if this is a POST request from mobile app or GET from web flow
    const isMobileFlow = req.method === 'POST';
    
    // Check if this is a test callback from our test route
    const isTestCallback = req.query.code === 'test_authorization_code' || 
                         req.originalUrl.includes('/square/test-callback');
    
    // EXTENSIVE DEBUGGING LOGS - Print all available request information
    console.log('====== OAUTH CALLBACK DEBUG ======');
    console.log('Request Method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Original URL:', req.originalUrl);
    console.log('Is Test Callback:', isTestCallback);
    console.log('Request Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Request Query:', JSON.stringify(req.query, null, 2));
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Request Cookies:', JSON.stringify(req.cookies, null, 2));
    if (req.session) {
      console.log('Session Data:', JSON.stringify(req.session, null, 2));
    }
    console.log('================================');
    
    // For mobile flow, get params from request body
    // For web flow, get params from request query
    const code = isMobileFlow ? req.body.code : req.query.code;
    const state = isMobileFlow ? req.body.state : req.query.state;
    const codeVerifier = isMobileFlow ? req.body.code_verifier : null;
    
    console.log(`Callback received (${isMobileFlow ? 'mobile' : 'web'}) with state:`, state);
    
    if (!code) {
      // Log missing code
      await security.logAuthFailure({
        reason: 'missing_code',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        flow: isMobileFlow ? 'mobile' : 'web'
      });
      
      return res.status(400).json({ error: 'Authorization code is missing' });
    }
    
    // *** IMPORTANT: Make state validation more permissive for testing ***
    // For development purposes, accept any state to troubleshoot the rest of the flow
    let bypassStateValidation = false;
    
    // Bypass for tests or in dev mode
    if (process.env.NODE_ENV !== 'production' || isTestCallback) {
      console.log('DEVELOPMENT MODE OR TEST CALLBACK: State validation will be more permissive');
      bypassStateValidation = true;
    }
    
    // For web flow, verify state against cookie or session
    if (!isMobileFlow) {
      // Verify state parameter to prevent CSRF attacks
      const savedState = req.cookies.square_oauth_state;
      
      // For mobile apps, check session storage as well
      const hasSessionState = req.session && 
                              req.session.oauthParams && 
                              req.session.oauthParams[state];
      
      console.log('Saved state from cookie:', savedState);
      console.log('Has session state:', hasSessionState);
      
      if (!state) {
        console.log('WARNING: Missing state parameter in callback');
        
        if (!bypassStateValidation) {
          await security.logAuthFailure({
            reason: 'missing_state',
            ip: req.ip,
            user_agent: req.headers['user-agent'],
            flow: 'web'
          });
          
          return res.status(400).json({ error: 'Missing state parameter' });
        } else {
          console.log('BYPASSING state validation since we are in development mode or test callback');
        }
      }
      
      // Allow the state if it's in the cookies OR in the session
      // Also allowing test-state-parameter for testing
      // In dev mode, we'll bypass the check entirely
      const isValidState = bypassStateValidation || 
                           (savedState && savedState === state) || 
                           hasSessionState || 
                           state === 'test-state-parameter';
      
      if (!isValidState) {
        // Log security violation
        console.error('Invalid state parameter received:', state);
        console.error('Expected state from cookie:', savedState);
        console.error('State in session:', hasSessionState ? 'yes' : 'no');
        
        await security.logAuthFailure({
          reason: 'invalid_state',
          ip: req.ip,
          expected: savedState,
          received: state,
          user_agent: req.headers['user-agent'],
          flow: 'web'
        });
        
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      
      // Clear the state cookie
      res.clearCookie('square_oauth_state');
      
      // Retrieve code verifier from session if using PKCE
      if (hasSessionState) {
        codeVerifier = req.session.oauthParams[state].codeVerifier;
        console.log('Retrieved code verifier from session');
        
        // Clean up after use
        delete req.session.oauthParams[state];
      } else if (req.cookies.square_code_verifier) {
        // For web flow, try to get code verifier from cookie
        codeVerifier = req.cookies.square_code_verifier;
        console.log('Looking for code verifier in cookies:', !!codeVerifier);
        
        res.clearCookie('square_code_verifier');
      }
    } else {
      // For mobile flow, validate that we have a state and code verifier
      if (!state && !bypassStateValidation) {
        await security.logAuthFailure({
          reason: 'missing_state',
          ip: req.ip,
          user_agent: req.headers['user-agent'],
          flow: 'mobile'
        });
        
        return res.status(400).json({ error: 'Missing state parameter' });
      }
      
      if (!codeVerifier && !bypassStateValidation) {
        await security.logAuthFailure({
          reason: 'missing_code_verifier',
          ip: req.ip,
          user_agent: req.headers['user-agent'],
          flow: 'mobile'
        });
        
        return res.status(400).json({ error: 'Missing code verifier' });
      }
    }
    
    console.log('Proceeding to token exchange. Code:', !!code, 'CodeVerifier:', !!codeVerifier);
    
    // Exchange the authorization code for an access token
    try {
      // Use mock data for test callback
      let tokenResponse;
      let merchantInfo;
      
      if (isTestCallback || code === 'test_authorization_code') {
        console.log('USING MOCK DATA FOR TEST CALLBACK');
        
        // Generate a fake access token that looks realistic
        tokenResponse = {
          access_token: 'TEST_EAAAEO' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
          token_type: 'bearer',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          merchant_id: 'TEST_' + Math.random().toString(36).substring(2, 10),
          refresh_token: 'TEST_REFRESH_' + Math.random().toString(36).substring(2, 15),
          scope: 'ITEMS_READ ITEMS_WRITE MERCHANT_PROFILE_READ',
          expires_in: 30 * 24 * 60 * 60 // 30 days in seconds
        };
        
        // Create a fake merchant
        merchantInfo = {
          id: tokenResponse.merchant_id,
          business_name: 'Test Production Merchant',
          country: 'US',
          language_code: 'en-US',
          currency: 'USD',
          status: 'ACTIVE',
          main_location_id: 'test-location-' + Math.random().toString(36).substring(2, 10)
        };
      } else {
        // Regular Square API exchange
        tokenResponse = await squareService.exchangeCodeForToken(code, codeVerifier);
        console.log('Token exchange successful. Response:', JSON.stringify(tokenResponse, null, 2));
        
        // Get merchant information using the access token
        merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
        console.log('Merchant info retrieved:', JSON.stringify(merchantInfo, null, 2));
      }
      
      // Add merchant ID to the token response for the client
      tokenResponse.merchant_id = merchantInfo.id;
      
      // Check if user with this merchant ID already exists
      let user = await User.findBySquareMerchantId(merchantInfo.id);
      let isNewUser = false;
      
      if (user) {
        console.log('Existing user found with merchant ID:', merchantInfo.id);
        // Update the user's Square credentials
        user = await User.update(user.id, {
          square_access_token: tokenResponse.access_token,
          square_refresh_token: tokenResponse.refresh_token,
          square_token_expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        });
      } else {
        isNewUser = true;
        console.log('Creating new user with merchant ID:', merchantInfo.id);
        // Create a new user
        user = await User.create({
          name: merchantInfo.business_name || merchantInfo.name,
          email: merchantInfo.email || `merchant-${merchantInfo.id}@example.com`, // Fallback, ideally collect this separately
          square_merchant_id: merchantInfo.id,
          square_access_token: tokenResponse.access_token,
          square_refresh_token: tokenResponse.refresh_token,
          square_token_expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        });
      }
      
      // Generate JWT for the user
      const token = User.generateToken(user);
      console.log('JWT token generated for user');
      
      // Add the JWT to the response for the mobile client
      tokenResponse.jwt = token;
      
      // Log successful OAuth completion
      await security.logOAuthActivity({
        action: 'oauth_complete',
        user_id: user.id,
        merchant_id: merchantInfo.id,
        is_new_user: isNewUser,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        flow: isMobileFlow ? 'mobile' : 'web'
      });
      
      // For mobile flow, return the tokens as JSON
      if (isMobileFlow) {
        console.log('Returning token response as JSON for mobile client');
        return res.json(tokenResponse);
      }
      
      // For web flow, redirect to success page
      console.log('Redirecting to success page for web client');
      res.redirect(`/api/auth/success?token=${token}`);
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      console.error('Error details:', tokenError.stack);
      throw tokenError;
    }
  } catch (error) {
    console.error('Error handling Square callback:', error);
    console.error('Stack trace:', error.stack);
    
    // Log OAuth failure
    await security.logOAuthActivity({
      action: 'oauth_error',
      error: error.message,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      flow: req.method === 'POST' ? 'mobile' : 'web'
    }, false);
    
    // For mobile flow, return JSON error
    if (req.method === 'POST') {
      return res.status(500).json({ error: 'Failed to complete OAuth flow', details: error.message });
    }
    
    // For web flow, show error page
    res.status(500).json({ error: 'Failed to complete OAuth flow', details: error.message });
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
  try {
    // Generate state parameter
    const state = squareService.generateStateParam();
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = squareService.generateCodeVerifier();
    const codeChallenge = squareService.generateCodeChallenge(codeVerifier);
    
    // Store values in database or session for later verification
    // This is temporary - in production you might want to use DynamoDB or Redis
    if (!req.session.oauthParams) {
      req.session.oauthParams = {};
    }
    req.session.oauthParams[state] = { 
      codeVerifier,
      createdAt: Date.now()
    };
    
    console.log('Mobile OAuth initialized with state:', state);
    
    // Generate the authorization URL with the state parameter and code challenge
    const authUrl = await squareService.getAuthorizationUrl(state, codeChallenge);
    
    // Return the parameters to the mobile app
    res.json({
      authUrl,
      state,
      codeVerifier,
      codeChallenge
    });
  } catch (error) {
    console.error('Error initializing mobile OAuth:', error);
    res.status(500).json({ error: 'Failed to initialize OAuth' });
  }
}

// Export the controller functions
module.exports = {
  startSquareOAuth,
  handleSquareCallback,
  oauthSuccess,
  revokeToken,
  initMobileOAuth,
  refreshToken
}; 