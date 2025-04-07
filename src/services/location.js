/**
 * Square Location Service
 * Provides methods to interact with Square Locations API
 */
const { getSquareClient } = require('./square');
const { handleSquareError } = require('../utils/errorHandling');
const squareService = require('./square');

// Square API version configuration - centralized for easy updates
const SQUARE_API_VERSION = 'v2';
// Square API header version - updated to latest available version
const SQUARE_API_HEADER_VERSION = '2025-03-19';

/**
 * List all locations
 * @param {string} accessToken - Square access token
 * @returns {Promise<Object>} List of locations
 */
async function listLocations(accessToken) {
  try {
    console.log(`=== REQUEST BOUNDARY: listLocations (${SQUARE_API_VERSION}) START ===`);

    // Check cache first
    const cacheKey = `locations-${accessToken}`;
    const cachedData = squareService.getCachedResponse(cacheKey, 'locations');
    if (cachedData) {
      console.log('Using cached locations data');
      console.log('=== REQUEST BOUNDARY: listLocations END (Cached) ===');
      return cachedData;
    }

    // Use executeSquareRequest to handle retries and errors
    const result = await squareService.executeSquareRequest(
      async client => {
        console.log(
          `Making listLocations call to Square ${SQUARE_API_VERSION} API with header version ${SQUARE_API_HEADER_VERSION}`
        );
        // Set the Square version in the client's configuration
        client.agent.defaultHeaders['Square-Version'] = SQUARE_API_HEADER_VERSION;
        return client.locations.listLocations();
      },
      accessToken,
      'square-api'
    );

    console.log('=== REQUEST BOUNDARY: listLocations END ===');
    console.log('Successfully retrieved locations:', {
      count: result.result.locations?.length || 0,
    });

    const response = {
      success: true,
      locations: result.result.locations || [],
    };

    // Cache the result (locations don't change often)
    squareService.cacheResponse(cacheKey, response, 'locations');

    return response;
  } catch (error) {
    console.error('Error listing locations:', error);
    return handleSquareError(error, 'Failed to list locations');
  }
}

module.exports = {
  listLocations,
  SQUARE_API_VERSION,
  SQUARE_API_HEADER_VERSION,
};
