/**
 * Merchant API Routes
 * Endpoints for retrieving merchant information
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const squareService = require('../services/square');
const { handleApiError } = require('../utils/errorHandling');

/**
 * @route   GET /api/merchant/me
 * @desc    Get information for the currently authenticated merchant
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
  try {
    console.log('Fetching merchant info for authenticated user');
    // Prefer the fetch-based implementation for Node.js 22
    const merchantInfo = await squareService.getMerchantInfoWithFetch(req.user.squareAccessToken);

    if (!merchantInfo) {
      return res.status(404).json({ success: false, message: 'Merchant information not found.' });
    }

    // Return relevant merchant details
    res.json({ success: true, merchant: merchantInfo });
  } catch (error) {
    console.error('Error fetching merchant info:', error);
    // Use a generic API error handler if available, otherwise fallback
    if (typeof handleApiError === 'function') {
      return handleApiError(res, error, 'Failed to fetch merchant information');
    } else {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch merchant information',
        error: error.details || error.toString(),
      });
    }
  }
});

module.exports = router;
