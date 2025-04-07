/**
 * Location API Routes
 * Endpoints for Square location management
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const locationService = require('../services/location');

/**
 * @route GET /api/locations
 * @desc List all locations for the authenticated merchant
 * @access Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const result = await locationService.listLocations(req.user.squareAccessToken);
    res.json(result);
  } catch (error) {
    console.error('Error retrieving locations:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get locations',
      error: error.details || error.toString(),
    });
  }
});

module.exports = router;
