const User = require('../models/user');
const squareService = require('../services/square');
const security = require('../utils/security');

/**
 * Start Square OAuth flow with PKCE support for mobile apps
 */
async function startSquareOAuth(req, res) {
  try {
    // Generate a state parameter to prevent CSRF attacks
    const state = squareService.generateStateParam();
    
    // Generate PKCE code verifier and challenge if client indicates it supports PKCE
    let codeVerifier = null;
    let codeChallenge = null;
    
    if (req.query.pkce === 'true') {
      codeVerifier = squareService.generateCodeVerifier();
      codeChallenge = squareService.generateCodeChallenge(codeVerifier);
      
      // Store the code verifier in a cookie for later verification
      res.cookie('square_code_verifier', codeVerifier, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000 // 10 minutes
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
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
    
    // Generate the authorization URL with the state parameter and code challenge if available
    const authUrl = await squareService.getAuthorizationUrl(state, codeChallenge);
    
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
    const { code, state } = req.query;
    
    // Verify state parameter to prevent CSRF attacks
    const savedState = req.cookies.square_oauth_state;
    
    if (!savedState || savedState !== state) {
      // Log security violation
      await security.logAuthFailure({
        reason: 'invalid_state',
        ip: req.ip,
        state: state,
        user_agent: req.headers['user-agent']
      });
      
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Clear the state cookie
    res.clearCookie('square_oauth_state');
    
    if (!code) {
      // Log missing code
      await security.logAuthFailure({
        reason: 'missing_code',
        ip: req.ip,
        user_agent: req.headers['user-agent']
      });
      
      return res.status(400).json({ error: 'Authorization code is missing' });
    }
    
    // Exchange the authorization code for an access token
    const tokenResponse = await squareService.exchangeCodeForToken(code);
    
    // Get merchant information using the access token
    const merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
    
    // Check if user with this merchant ID already exists
    let user = await User.findBySquareMerchantId(merchantInfo.id);
    let isNewUser = false;
    
    if (user) {
      // Update the user's Square credentials
      user = await User.update(user.id, {
        square_access_token: tokenResponse.access_token,
        square_refresh_token: tokenResponse.refresh_token,
        square_token_expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      });
    } else {
      isNewUser = true;
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
    
    // Log successful OAuth completion
    await security.logOAuthActivity({
      action: 'oauth_complete',
      user_id: user.id,
      merchant_id: merchantInfo.id,
      is_new_user: isNewUser,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    // Redirect to success page or front-end app with the token
    res.redirect(`/api/auth/success?token=${token}`);
  } catch (error) {
    console.error('Error handling Square callback:', error);
    
    // Log OAuth failure
    await security.logOAuthActivity({
      action: 'oauth_error',
      error: error.message,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    }, false);
    
    res.status(500).json({ error: 'Failed to complete OAuth flow' });
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
 * Revoke Square OAuth token and log the user out
 */
async function revokeToken(req, res) {
  try {
    const { userId } = req.params;
    
    // Fetch the user
    const user = await User.findById(userId);
    
    if (!user) {
      await security.logTokenRevocation({
        action: 'revoke_attempt',
        requested_user_id: userId,
        requester_id: req.user?.id,
        reason: 'user_not_found',
        ip: req.ip,
        user_agent: req.headers['user-agent']
      }, false);
      
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate that the requesting user is the same as the user being modified
    if (req.user.id !== userId) {
      await security.logTokenRevocation({
        action: 'revoke_attempt',
        requested_user_id: userId,
        requester_id: req.user.id,
        reason: 'unauthorized',
        ip: req.ip,
        user_agent: req.headers['user-agent']
      }, false);
      
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Revoke the Square access token
    if (user.square_access_token) {
      await squareService.revokeToken(user.square_access_token);
    }
    
    // Update user record
    await User.update(userId, {
      square_access_token: null,
      square_refresh_token: null,
      square_token_expires_at: null
    });
    
    // Log successful token revocation
    await security.logTokenRevocation({
      action: 'revoke_success',
      user_id: userId,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    res.json({ message: 'Token revoked successfully' });
  } catch (error) {
    console.error('Error revoking token:', error);
    
    // Log token revocation failure
    await security.logTokenRevocation({
      action: 'revoke_error',
      user_id: req.params.userId,
      error: error.message,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    }, false);
    
    res.status(500).json({ error: 'Failed to revoke token' });
  }
}

module.exports = {
  startSquareOAuth,
  handleSquareCallback,
  oauthSuccess,
  revokeToken
}; 