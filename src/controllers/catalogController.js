/**
 * Catalog Controller
 * Handles request logic for catalog routes
 */
const catalogService = require('../services/catalog');
const { safeSerialize } = require('../utils/errorHandling');

/**
 * Handler for POST /catalog/search-items
 * Searches catalog items using a text filter.
 */
async function searchItemsByTextHandler(req, res) {
  try {
    console.log('[CONTROLLER] Handling searchItemsByText request');
    const { textFilter, limit, cursor } = req.body;
    const accessToken = req.user.squareAccessToken;

    if (!textFilter) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: textFilter',
      });
    }

    const result = await catalogService.searchCatalogItemsByText(
      accessToken,
      textFilter,
      limit, // Pass limit (defaults to 100 in service if undefined)
      cursor // Pass cursor (defaults to undefined in service if undefined)
    );

    if (!result.success) {
      // Service layer already formats Square errors
      return res.status(result.status || 500).json(result);
    }

    // Add metadata
    const enrichedResult = {
      ...result,
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'SearchCatalogItemsByText',
      },
    };

    // Ensure response is safe to serialize
    const safeResult = safeSerialize(enrichedResult);
    return res.json(safeResult);
  } catch (error) {
    console.error('[CONTROLLER] Error in searchItemsByTextHandler:', error);
    const errorResponse = safeSerialize({
      success: false,
      message: error.message || 'Internal server error during item search',
      error: error.toString(),
    });
    return res.status(500).json(errorResponse);
  }
}

module.exports = {
  searchItemsByTextHandler,
};
