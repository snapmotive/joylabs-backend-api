const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getSquareClient } = require('../services/square');

/**
 * Middleware to protect routes
 * Verifies JWT token and attaches user to request
 */
async function protect(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    // Log auth attempt with sanitized token info
    console.log('Auth attempt:', {
      path: req.path,
      hasToken: !!authHeader,
      tokenPreview: authHeader ? 
        `${authHeader.substring(0, 12)}...${authHeader.substring(authHeader.length - 5)}` : 
        'none'
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth failed: No bearer token provided');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - No bearer token provided',
        error: 'Missing or invalid authorization header'
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log('Auth failed: Empty token');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - Empty token',
        error: 'Empty token provided'
      });
    }

    try {
      // Initialize Square client with the token
      console.log('Validating Square access token...');
      const squareClient = getSquareClient(token);
      
      // Attempt to validate the token by making a lightweight API call
      // This will throw an error if the token is invalid
      const { result } = await squareClient.merchantsApi.retrieveMerchant('me');
      
      if (!result || !result.merchant || !result.merchant.id) {
        console.error('Auth failed: Invalid Square response', { 
          hasResult: !!result,
          hasMerchant: result && !!result.merchant
        });
        return res.status(401).json({
          success: false,
          message: 'Authentication failed - Invalid merchant data',
          error: 'Invalid merchant data from Square API'
        });
      }

      // Add the user info to the request object
      req.user = {
        merchantId: result.merchant.id,
        squareAccessToken: token,
        businessName: result.merchant.business_name || result.merchant.business_email || 'Unknown',
        countryCode: result.merchant.country,
        languageCode: result.merchant.language_code
      };

      console.log('Auth successful:', { 
        merchantId: result.merchant.id,
        businessName: req.user.businessName,
        path: req.path 
      });

      // Call the next middleware
      next();
    } catch (error) {
      // Handle different types of auth errors
      console.error('Square API auth error:', {
        name: error.name,
        message: error.message,
        status: error.statusCode,
        path: req.path,
        tokenFirstFiveChars: token.substring(0, 5)
      });

      // Check if it's a permissions error
      if (error.message && error.message.includes('permission')) {
        return res.status(403).json({
          success: false,
          message: 'Authentication failed - Insufficient permissions',
          error: 'The provided token does not have the required permissions'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Authentication failed - Invalid token',
        error: error.message || 'Failed to validate Square token'
      });
    }
  } catch (error) {
    console.error('Unexpected auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      error: error.message
    });
  }
}

/**
 * Middleware to handle Square OAuth token expiration
 * Should be used after protect middleware
 */
async function refreshSquareTokenIfNeeded(req, res, next) {
  try {
    const user = req.user;
    
    // Check if user has Square connection
    if (!user.square_access_token || !user.square_token_expires_at) {
      return next();
    }
    
    // Check if token is expired or about to expire (within 1 hour)
    const tokenExpiresAt = new Date(user.square_token_expires_at).getTime();
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    
    if (tokenExpiresAt - now < oneHourInMs) {
      // Token is expired or about to expire, refresh it
      const squareService = require('../services/square');
      
      try {
        const refreshToken = user.square_refresh_token;
        
        if (!refreshToken) {
          // No refresh token, user needs to re-authenticate
          return res.status(401).json({ 
            error: 'Square authorization expired', 
            squareAuthRequired: true 
          });
        }
        
        // Use Square service to refresh token
        const response = await squareService.refreshToken(refreshToken);
        
        // Update user with new tokens
        const updatedUser = await User.update(user.id, {
          square_access_token: response.access_token,
          square_refresh_token: response.refresh_token,
          square_token_expires_at: new Date(Date.now() + response.expires_in * 1000).toISOString()
        });
        
        // Update request user
        req.user = updatedUser;
      } catch (error) {
        console.error('Error refreshing Square token:', error);
        return res.status(401).json({ 
          error: 'Failed to refresh Square authorization', 
          squareAuthRequired: true 
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Square token refresh error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Authentication middleware
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Missing token'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.merchant_id) {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }

    // Add user info to request
    req.user = {
      merchant_id: decoded.merchant_id
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      error: 'Authentication failed'
    });
  }
};

module.exports = {
  protect,
  refreshSquareTokenIfNeeded,
  authenticate
}; 