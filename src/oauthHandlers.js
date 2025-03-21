const serverless = require('serverless-http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { exchangeCodeForToken, getMerchantInfo } = require('./services/square');
const User = require('./models/user');
const jwt = require('jsonwebtoken');

// Create Express app for OAuth handlers
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/**
 * Handle OAuth success redirect
 */
app.get('/auth/success', (req, res) => {
  console.log('Handling OAuth success redirect');
  const { token } = req.query;

  if (!token) {
    console.error('No token provided in success redirect');
    return res.status(400).json({ error: 'No token provided' });
  }

  // In production, you would redirect to your frontend app with the token
  // For now, we'll show a simple success page
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Square Connection Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f7f7f7;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 90%;
          }
          h1 {
            color: #21a67a;
            margin-bottom: 1rem;
          }
          p {
            color: #666;
            line-height: 1.5;
          }
          .token {
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            font-size: 0.9rem;
            margin: 1rem 0;
            color: #333;
          }
          .close-button {
            background: #21a67a;
            color: white;
            border: none;
            padding: 0.8rem 2rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 1rem;
          }
          .close-button:hover {
            background: #1a8561;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Square Connection Successful! 🎉</h1>
          <p>Your Square account has been successfully connected.</p>
          <p>Your access token:</p>
          <div class="token">${token}</div>
          <p>Please save this token securely. You'll need it for API calls.</p>
          <button class="close-button" onclick="window.close()">Close Window</button>
        </div>
      </body>
    </html>
  `;

  res.send(html);
});

/**
 * Handle Square OAuth callback
 */
app.get('/api/auth/square/callback', async (req, res) => {
  console.log('Handling Square OAuth callback');
  console.log('Query parameters:', req.query);
  console.log('Headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    'user-agent': req.headers['user-agent']
  });

  try {
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

    // Exchange code for token
    console.log('Exchanging authorization code for token');
    let tokenResponse;
    try {
      tokenResponse = await exchangeCodeForToken(code);
      console.log('Token exchange successful');
    } catch (tokenError) {
      console.error('Token exchange failed:', tokenError);
      return res.status(401).json({
        error: 'Failed to exchange authorization code',
        type: tokenError.response?.data?.type || 'token_exchange_error'
      });
    }

    // Get merchant information
    console.log('Getting merchant information');
    let merchantInfo;
    try {
      merchantInfo = await getMerchantInfo(tokenResponse.access_token, tokenResponse.merchant_id);
      console.log('Merchant info retrieved:', {
        business_name: merchantInfo.name,
        merchant_id: tokenResponse.merchant_id
      });
    } catch (merchantError) {
      console.error('Failed to get merchant info:', merchantError);
      return res.status(500).json({
        error: 'Failed to get merchant information',
        type: 'merchant_info_error'
      });
    }

    // Find or create user
    console.log('Finding or creating user');
    const userId = `user-${tokenResponse.merchant_id}`;
    let user;
    try {
      user = await User.findBySquareMerchantId(tokenResponse.merchant_id);

      if (!user) {
        console.log('Creating new user for merchant:', tokenResponse.merchant_id);
        user = await User.create({
          id: userId,
          name: merchantInfo.name || 'Square Merchant',
          email: merchantInfo.email || `${tokenResponse.merchant_id}@example.com`,
          square_merchant_id: tokenResponse.merchant_id,
          square_access_token: tokenResponse.access_token,
          square_refresh_token: tokenResponse.refresh_token,
          square_token_expires_at: tokenResponse.expires_at
        });
        console.log('New user created:', user.id);
      } else {
        console.log('Found existing user:', user.id);
        // Update user with new tokens
        console.log('Updating user with new tokens');
        await User.update(user.id, {
          square_access_token: tokenResponse.access_token,
          square_refresh_token: tokenResponse.refresh_token,
          square_token_expires_at: tokenResponse.expires_at
        });
        console.log('User tokens updated successfully');
      }
    } catch (userError) {
      console.error('User operation failed:', userError);
      return res.status(500).json({
        error: 'Failed to process user data',
        type: 'user_operation_error'
      });
    }

    // Generate JWT token
    let token;
    try {
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
      }
      token = jwt.sign({
        sub: user.id,
        name: user.name,
        email: user.email,
        merchant_id: tokenResponse.merchant_id
      }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });
    } catch (jwtError) {
      console.error('JWT generation failed:', jwtError);
      return res.status(500).json({
        error: 'Failed to generate authentication token',
        type: 'jwt_error'
      });
    }

    // Redirect to success page with token
    const redirectUrl = `${process.env.API_BASE_URL}/auth/success?token=${token}`;
    console.log('Redirecting to success page:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Square callback:', error);
    console.error('Stack trace:', error.stack);
    
    // Send appropriate error response
    res.status(500).json({
      error: 'Failed to complete OAuth flow',
      type: 'internal_error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Handler for the serverless function
exports.squareCallback = serverless(app); 