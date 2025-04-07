/**
 * Catalog API Routes
 * Endpoints for Square catalog management
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const catalogService = require('../services/catalog');
const CatalogItem = require('../models/CatalogItem');

/**
 * @route GET /api/catalog/list
 * @desc List catalog items
 * @access Private
 */
router.get('/list', protect, async (req, res) => {
  try {
    // Default limit increased to 1000, aligned with service layer cap.
    // Types default remains ITEM,CATEGORY unless specified.
    const { limit = 1000, types = 'ITEM,CATEGORY', cursor } = req.query;

    // Remove the local DB lookup for full catalog sync via /list
    // // First, check our database for stored items for this merchant
    // const storedItems = await CatalogItem.list({
    //   merchant_id: req.user.merchantId,
    //   page: parseInt(page), // page is no longer used
    //   limit: parseInt(limit),
    // });

    // Get items directly from Square using the service
    const result = await catalogService.listCatalogItems(req.user.squareAccessToken, {
      types: types.split(','),
      limit: parseInt(limit),
      cursor: cursor, // Pass cursor directly
      // We can infer includeRelatedObjects/includeDeletedObjects if needed from query params too
      // includeRelatedObjects: req.query.includeRelatedObjects === 'true',
      // includeDeletedObjects: req.query.includeDeletedObjects === 'true',
    });

    // Remove local data enrichment for this route - focus on raw Square data for sync
    // // If we have local data, enrich the Square results
    // if (storedItems.items.length > 0) {
    //   // ... enrichment logic removed ...
    // }

    res.json(result);
  } catch (error) {
    console.error('Error listing catalog items:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list catalog items',
      error: error.details || error.toString(),
    });
  }
});

/**
 * @route GET /api/catalog/item/:id
 * @desc Get a catalog item by ID
 * @access Private
 */
router.get('/item/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await catalogService.getCatalogItem(req.user.squareAccessToken, id);

    // Try to get local data
    try {
      const localData = await CatalogItem.findBySquareCatalogId(id);
      if (localData) {
        result.catalogObject.local_data = {
          id: localData.id,
          created_at: localData.created_at,
          updated_at: localData.updated_at,
          metadata: localData.metadata,
        };
      }
    } catch (dbError) {
      console.error('Error retrieving local catalog data:', dbError);
    }

    res.json(result);
  } catch (error) {
    console.error(`Error retrieving catalog item ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get catalog item',
      error: error.details || error.toString(),
    });
  }
});

/**
 * Validate catalog item creation request
 */
const validateCatalogItemRequest = validateRequest({
  body: {
    type: {
      type: 'string',
      required: true,
      enum: ['ITEM', 'CATEGORY', 'TAX', 'DISCOUNT', 'MODIFIER', 'MODIFIER_LIST', 'IMAGE'],
    },
    name: { type: 'string', required: true },
    description: { type: 'string' },
    abbreviation: { type: 'string' },
    categoryId: { type: 'string' },
    variations: { type: 'array' },
    productType: {
      type: 'string',
      enum: ['REGULAR', 'APPOINTMENTS_SERVICE'],
    },
    // Tax specific fields
    calculationPhase: {
      type: 'string',
      enum: ['TAX_SUBTOTAL_PHASE', 'TAX_TOTAL_PHASE'],
    },
    inclusionType: {
      type: 'string',
      enum: ['ADDITIVE', 'INCLUSIVE'],
    },
    percentage: { type: 'string' },
    appliesToCustomAmounts: { type: 'boolean' },
    enabled: { type: 'boolean' },
    // Discount specific fields
    discountType: {
      type: 'string',
      enum: ['FIXED_PERCENTAGE', 'FIXED_AMOUNT', 'VARIABLE_PERCENTAGE', 'VARIABLE_AMOUNT'],
    },
    amountMoney: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
      },
    },
    pinRequired: { type: 'boolean' },
    labelColor: { type: 'string' },
    // Modifier list specific fields
    selectionType: {
      type: 'string',
      enum: ['SINGLE', 'MULTIPLE'],
    },
    modifiers: { type: 'array' },
    // Image specific fields
    url: { type: 'string' },
    caption: { type: 'string' },
    // Common fields
    imageIds: { type: 'array' },
    idempotencyKey: { type: 'string' },
  },
});

/**
 * @route POST /api/catalog/item
 * @desc Create or update a catalog item
 * @access Private
 */
router.post('/item', protect, validateCatalogItemRequest, async (req, res) => {
  try {
    const result = await catalogService.createOrUpdateCatalogItem(
      req.user.squareAccessToken,
      req.body
    );

    res.json(result);
  } catch (error) {
    console.error('Error creating/updating catalog item:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create/update catalog item',
      error: error.details || error.toString(),
    });
  }
});

/**
 * @route DELETE /api/catalog/item/:id
 * @desc Delete a catalog item
 * @access Private
 */
router.delete('/item/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await catalogService.deleteCatalogItem(req.user.squareAccessToken, id);

    res.json(result);
  } catch (error) {
    console.error(`Error deleting catalog item ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete catalog item',
      error: error.details || error.toString(),
    });
  }
});

/**
 * @route POST /search
 * @desc Search catalog objects using Square-compatible params
 * @access Private
 */
router.post('/search', protect, async (req, res) => {
  try {
    console.log('[REQUEST BOUNDARY: CATALOG SEARCH START]');
    console.log('[ROUTES] Received catalog search request:', JSON.stringify(req.body, null, 2));

    // Directly handle the empty query case - Defense in depth
    let searchParams = { ...req.body };

    // Check if query is missing or empty
    if (
      !searchParams.query ||
      (typeof searchParams.query === 'object' && Object.keys(searchParams.query).length === 0)
    ) {
      console.log('[ROUTES] Empty query detected in handler, using default exact_query');
      searchParams.query = {
        exact_query: {
          attribute_name: 'name',
          attribute_value: '.', // Use a very common character to match almost everything
        },
      };
    } else if (searchParams.query.text_query) {
      // Special handling for text_query with incorrect format
      if (searchParams.query.text_query.query !== undefined) {
        // Frontend sent text_query with 'query' field instead of 'keywords' array
        const queryText = searchParams.query.text_query.query;

        if (queryText && queryText.trim() !== '') {
          // If there's actual text, convert to proper keywords array format
          console.log('[ROUTES] Converting text_query.query to keywords array');
          searchParams.query.text_query = {
            keywords: [queryText.trim()],
          };
        } else {
          // Empty query text, use our reliable exact_query approach
          console.log('[ROUTES] Empty text_query.query detected, using exact_query instead');
          searchParams.query = {
            exact_query: {
              attribute_name: 'name',
              attribute_value: '.',
            },
          };
        }
      } else if (
        !searchParams.query.text_query.keywords ||
        !Array.isArray(searchParams.query.text_query.keywords) ||
        searchParams.query.text_query.keywords.length === 0
      ) {
        // Malformed text_query without keywords array or with empty array
        console.log('[ROUTES] Malformed text_query detected, using exact_query instead');
        searchParams.query = {
          exact_query: {
            attribute_name: 'name',
            attribute_value: '.',
          },
        };
      }
    } else {
      // Not using text_query, check other query types for validity
      const validQueryTypes = [
        'prefix_query',
        'exact_query',
        'sorted_attribute_query',
        'text_query',
        'item_query',
        'item_variation_query',
        'items_for_tax_query',
        'items_for_modifier_list_query',
        'items_for_item_options',
      ];

      const queryKeys = Object.keys(searchParams.query).filter(key =>
        validQueryTypes.includes(key)
      );

      if (queryKeys.length === 0) {
        console.log('[ROUTES] No valid query types found in request, using default exact_query');
        searchParams.query = {
          exact_query: {
            attribute_name: 'name',
            attribute_value: '.', // Use a very common character to match almost everything
          },
        };
      }
    }

    console.log('[ROUTES] Modified search params:', JSON.stringify(searchParams, null, 2));

    const result = await catalogService.searchCatalogItems(
      req.user.squareAccessToken,
      searchParams
    );

    console.log('[REQUEST BOUNDARY: CATALOG SEARCH END] Success:', result.success);
    res.json(result);
  } catch (error) {
    console.error('[REQUEST BOUNDARY: CATALOG SEARCH END] Error:', error.message);
    console.error('[ROUTES] Error searching catalog objects:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to search catalog objects',
      error: error.details || error.toString(),
    });
  }
});

/**
 * @route POST /api/catalog/batch-retrieve
 * @desc Batch retrieve catalog objects
 * @access Private
 */
router.post(
  '/batch-retrieve',
  protect,
  validateRequest({
    body: {
      objectIds: { type: 'array', required: true },
      includeRelatedObjects: { type: 'boolean' },
    },
  }),
  async (req, res) => {
    try {
      const { objectIds, includeRelatedObjects = true } = req.body;

      const result = await catalogService.batchRetrieveCatalogObjects(
        req.user.squareAccessToken,
        objectIds,
        includeRelatedObjects
      );

      res.json(result);
    } catch (error) {
      console.error('Error batch retrieving catalog objects:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to batch retrieve catalog objects',
        error: error.details || error.toString(),
      });
    }
  }
);

/**
 * @route POST /api/catalog/batch-upsert
 * @desc Batch upsert catalog objects
 * @access Private
 */
router.post(
  '/batch-upsert',
  protect,
  validateRequest({
    body: {
      batches: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          properties: {
            objects: { type: 'array', required: true },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const { batches } = req.body;

      const result = await catalogService.batchUpsertCatalogObjects(
        req.user.squareAccessToken,
        batches
      );

      res.json(result);
    } catch (error) {
      console.error('Error batch upserting catalog objects:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to batch upsert catalog objects',
        error: error.details || error.toString(),
      });
    }
  }
);

/**
 * @route POST /api/catalog/batch-delete
 * @desc Batch delete catalog objects
 * @access Private
 */
router.post(
  '/batch-delete',
  protect,
  validateRequest({
    body: {
      objectIds: { type: 'array', required: true },
    },
  }),
  async (req, res) => {
    try {
      const { objectIds } = req.body;

      const result = await catalogService.batchDeleteCatalogObjects(
        req.user.squareAccessToken,
        objectIds
      );

      res.json(result);
    } catch (error) {
      console.error('Error batch deleting catalog objects:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to batch delete catalog objects',
        error: error.details || error.toString(),
      });
    }
  }
);

/**
 * @route POST /api/catalog/item/:id/modifier-lists
 * @desc Update item modifier lists
 * @access Private
 */
router.post(
  '/item/:id/modifier-lists',
  protect,
  validateRequest({
    body: {
      modifierListsToEnable: { type: 'array' },
      modifierListsToDisable: { type: 'array' },
    },
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { modifierListsToEnable = [], modifierListsToDisable = [] } = req.body;

      const result = await catalogService.updateItemModifierLists(
        req.user.squareAccessToken,
        id,
        modifierListsToEnable,
        modifierListsToDisable
      );

      res.json(result);
    } catch (error) {
      console.error(`Error updating modifier lists for item ${req.params.id}:`, error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update item modifier lists',
        error: error.details || error.toString(),
      });
    }
  }
);

/**
 * @route POST /api/catalog/item/:id/taxes
 * @desc Update item taxes
 * @access Private
 */
router.post(
  '/item/:id/taxes',
  protect,
  validateRequest({
    body: {
      taxesToEnable: { type: 'array' },
      taxesToDisable: { type: 'array' },
    },
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { taxesToEnable = [], taxesToDisable = [] } = req.body;

      const result = await catalogService.updateItemTaxes(
        req.user.squareAccessToken,
        id,
        taxesToEnable,
        taxesToDisable
      );

      res.json(result);
    } catch (error) {
      console.error(`Error updating taxes for item ${req.params.id}:`, error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update item taxes',
        error: error.details || error.toString(),
      });
    }
  }
);

/**
 * @route GET /categories
 * @desc Get all categories - convenience route that uses search
 * @access Private
 */
router.get('/categories', protect, async (req, res) => {
  try {
    // Use the search endpoint with object_types set to CATEGORY
    const result = await catalogService.searchCatalogItems(req.user.squareAccessToken, {
      object_types: ['CATEGORY'],
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      cursor: req.query.cursor,
      include_related_objects: req.query.include_related_objects === 'true',
    });

    res.json(result);
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get categories',
      error: error.details || error.toString(),
    });
  }
});

module.exports = router;
