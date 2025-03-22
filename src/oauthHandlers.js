const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

// Import Square service
const squareService = require('./services/square');
const userService = require('./services/user');

// Create express app for OAuth handler
const app = express();

// Apply middleware
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400 // Cache CORS preflight requests for 24 hours
}));

// Basic logging
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Square callback route
app.get('/api/auth/square/callback', async (req, res) => {
  try {
    console.log('Received Square OAuth callback');
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }
    
    // Exchange code for tokens
    const tokenResponse = await squareService.getOAuthToken(code);
    
    if (!tokenResponse.success) {
      console.error('OAuth token exchange failed:', tokenResponse.error);
      return res.status(400).json({ error: 'Failed to exchange authorization code' });
    }
    
    // Store merchant info
    const { merchantId, accessToken, refreshToken, expiresAt } = tokenResponse.data;
    
    // Check if merchant already exists
    const existingMerchant = await userService.getMerchantById(merchantId);
    
    if (existingMerchant) {
      // Update existing merchant
      await userService.updateMerchantTokens(merchantId, accessToken, refreshToken, expiresAt);
      console.log(`Updated tokens for existing merchant: ${merchantId}`);
    } else {
      // Create new merchant record
      await userService.createMerchant(merchantId, accessToken, refreshToken, expiresAt);
      console.log(`Created new merchant: ${merchantId}`);
    }
    
    // Redirect to success page
    return res.redirect('/auth/success?merchant_id=' + merchantId);
  } catch (error) {
    console.error('Square callback error:', error);
    res.status(500).json({ error: 'An error occurred during OAuth process' });
  }
});

// Success page
app.get('/auth/success', (req, res) => {
  const merchantId = req.query.merchant_id || 'Unknown';
  res.send(`
    <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
          }
          .success-container {
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 500px;
            margin: 0 auto;
          }
          h1 {
            color: #28a745;
          }
        </style>
      </head>
      <body>
        <div class="success-container">
          <h1>Authorization Successful!</h1>
          <p>Your Square account has been successfully connected.</p>
          <p>Merchant ID: ${merchantId}</p>
          <p>You can now close this window and return to the app.</p>
        </div>
      </body>
    </html>
  `);
});

// Export Serverless handler
exports.squareCallback = serverless(app); 