const serverless = require('serverless-http');
const express = require('express');
const cookieParser = require('cookie-parser');
const User = require('./models/user');
const squareService = require('./services/square');

// Create Express app for OAuth handlers
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/**
 * Handle Square OAuth callback with PKCE support
 */
app.get('/api/auth/square/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Verify state parameter to prevent CSRF attacks
    const savedState = req.cookies.square_oauth_state;
    
    if (!savedState || savedState !== state) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Clear the state cookie
    res.clearCookie('square_oauth_state');
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is missing' });
    }
    
    // Get code verifier from session cookie if available (for PKCE)
    const codeVerifier = req.cookies.square_code_verifier;
    if (codeVerifier) {
      res.clearCookie('square_code_verifier');
    }
    
    // Exchange the authorization code for an access token
    const tokenResponse = await squareService.exchangeCodeForToken(code, codeVerifier);
    
    // Get merchant information using the access token
    const merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
    
    // Check if user with this merchant ID already exists
    let user = await User.findBySquareMerchantId(merchantInfo.id);
    
    if (user) {
      // Update the user's Square credentials
      user = await User.update(user.id, {
        square_access_token: tokenResponse.access_token,
        square_refresh_token: tokenResponse.refresh_token,
        square_token_expires_at: tokenResponse.expires_at
      });
    } else {
      // Create a new user
      user = await User.create({
        name: merchantInfo.business_name || merchantInfo.name,
        email: merchantInfo.email || `merchant-${merchantInfo.id}@example.com`, // Fallback
        square_merchant_id: merchantInfo.id,
        square_access_token: tokenResponse.access_token,
        square_refresh_token: tokenResponse.refresh_token,
        square_token_expires_at: tokenResponse.expires_at
      });
    }
    
    // Generate JWT for the user
    const token = User.generateToken(user);
    
    // Redirect to success page or front-end app with the token
    res.redirect(`/api/auth/success?token=${token}`);
  } catch (error) {
    console.error('Error handling Square callback:', error);
    res.status(500).json({ error: 'Failed to complete OAuth flow' });
  }
});

// Handler for the serverless function
exports.squareCallback = serverless(app); 