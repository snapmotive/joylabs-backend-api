const jwt = require('jsonwebtoken');
const User = require('../models/user');

/**
 * Middleware to protect routes
 * Verifies JWT token and attaches user to request
 */
async function protect(req, res, next) {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized - User no longer exists' });
      }
      
      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Server error' });
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
        
        // Exchange refresh token for new access token
        const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production'
          ? 'https://connect.squareup.com'
          : 'https://connect.squareupsandbox.com';
        
        const axios = require('axios');
        const response = await axios.post(`${baseUrl}/oauth2/token`, {
          client_id: process.env.SQUARE_APPLICATION_ID,
          client_secret: process.env.SQUARE_APPLICATION_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        });
        
        // Update user with new tokens
        const updatedUser = await User.update(user.id, {
          square_access_token: response.data.access_token,
          square_refresh_token: response.data.refresh_token,
          square_token_expires_at: new Date(Date.now() + response.data.expires_in * 1000).toISOString()
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

module.exports = {
  protect,
  refreshSquareTokenIfNeeded,
  authenticate: protect
}; 