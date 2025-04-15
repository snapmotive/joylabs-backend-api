const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getSquareClient } = require('../services/square');
const squareService = require('../services/square');

/**
 * Middleware to protect routes
 * Verifies JWT token and attaches user to request
 */
const protect = (req, res, next) => {
  console.log('Auth middleware invoked for path:', req.path);
  authenticate(req, res, next);
};

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

      try {
        const refreshToken = user.square_refresh_token;

        if (!refreshToken) {
          // No refresh token, user needs to re-authenticate
          return res.status(401).json({
            error: 'Square authorization expired',
            squareAuthRequired: true,
          });
        }

        // Use Square service to refresh token
        const response = await squareService.refreshToken(refreshToken);

        // Update user with new tokens
        const updatedUser = await User.update(user.id, {
          square_access_token: response.access_token,
          square_refresh_token: response.refresh_token,
          square_token_expires_at: new Date(Date.now() + response.expires_in * 1000).toISOString(),
        });

        // Update request user
        req.user = updatedUser;
      } catch (error) {
        console.error('Error refreshing Square token:', error);
        return res.status(401).json({
          error: 'Failed to refresh Square authorization',
          squareAuthRequired: true,
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
 * Authenticate the incoming request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    console.log('Authenticating request for', req.path);

    // Get the authorization header - use lowercase consistently for Node.js 22 compatibility
    // Headers in Node.js 22 are normalized to lowercase
    let authHeader = req.headers.authorization;

    // Check for header using request.get() method for Express compatibility
    if (!authHeader && req.get) {
      authHeader = req.get('Authorization');
    }

    // Check if we have a header
    console.log('Authorization header found:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - Missing or invalid authorization header',
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    console.log(
      '[DEBUG] Auth Middleware: Extracted token preview:',
      token ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}` : 'null or empty'
    );
    if (!token) {
      console.log('Empty token provided');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - Empty token',
      });
    }

    try {
      // Initialize Square client with the token
      console.log('Validating Square access token...');

      // Use squareService.getMerchantInfo() instead of direct client call
      const merchantInfo = await squareService.getMerchantInfo(token);

      if (!merchantInfo || !merchantInfo.id) {
        console.error('Auth failed: Invalid Square response', {
          hasMerchant: !!merchantInfo,
          hasMerchantId: merchantInfo && !!merchantInfo.id,
        });
        return res.status(401).json({
          success: false,
          message: 'Authentication failed - Invalid merchant data',
        });
      }

      // Add the user info to the request object
      req.user = {
        merchantId: merchantInfo.id,
        squareAccessToken: token,
        businessName: merchantInfo.businessName || 'Unknown',
        countryCode: merchantInfo.country,
        languageCode: merchantInfo.language,
      };

      console.log('Auth successful:', {
        merchantId: merchantInfo.id,
        businessName: req.user.businessName,
        path: req.path,
      });

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - ' + (error.message || 'Invalid token'),
      });
    }
  } catch (error) {
    console.error('Unexpected auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
};

module.exports = {
  protect,
  refreshSquareTokenIfNeeded,
  authenticate,
};
