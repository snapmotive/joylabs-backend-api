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
    const { page = 1, limit = 20, types = 'ITEM,CATEGORY' } = req.query;
    
    // First, check our database for stored items for this merchant
    const storedItems = await CatalogItem.list({
      merchant_id: req.user.merchantId,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    // Then get the items from Square (this will be more comprehensive)
    const result = await catalogService.listCatalogItems(
      req.user.squareAccessToken,
      { 
        types: types.split(','),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    );
    
    // If we have local data, enrich the Square results
    if (storedItems.items.length > 0) {
      // Create a map of Square catalog IDs to local data
      const localDataMap = storedItems.items.reduce((map, item) => {
        map[item.square_catalog_id] = item;
        return map;
      }, {});
      
      // Enrich the Square results with local data
      if (result.objects) {
        result.objects = result.objects.map(obj => {
          const localData = localDataMap[obj.id];
          if (localData) {
            return {
              ...obj,
              local_data: {
                id: localData.id,
                created_at: localData.created_at,
                updated_at: localData.updated_at,
                metadata: localData.metadata
              }
            };
          }
          return obj;
        });
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error listing catalog items:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to list catalog items',
      error: error.details || error.toString()
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
    
    const result = await catalogService.getCatalogItem(
      req.user.squareAccessToken,
      id
    );
    
    // Try to get local data
    try {
      const localData = await CatalogItem.findBySquareCatalogId(id);
      if (localData) {
        result.catalogObject.local_data = {
          id: localData.id,
          created_at: localData.created_at,
          updated_at: localData.updated_at,
          metadata: localData.metadata
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
      error: error.details || error.toString()
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
      enum: ['ITEM', 'CATEGORY', 'TAX', 'DISCOUNT', 'MODIFIER', 'MODIFIER_LIST', 'IMAGE']
    },
    name: { type: 'string', required: true },
    description: { type: 'string' },
    abbreviation: { type: 'string' },
    categoryId: { type: 'string' },
    variations: { type: 'array' },
    productType: { 
      type: 'string',
      enum: ['REGULAR', 'APPOINTMENTS_SERVICE']
    },
    // Tax specific fields
    calculationPhase: {
      type: 'string',
      enum: ['TAX_SUBTOTAL_PHASE', 'TAX_TOTAL_PHASE']
    },
    inclusionType: {
      type: 'string',
      enum: ['ADDITIVE', 'INCLUSIVE']
    },
    percentage: { type: 'string' },
    appliesToCustomAmounts: { type: 'boolean' },
    enabled: { type: 'boolean' },
    // Discount specific fields
    discountType: {
      type: 'string',
      enum: ['FIXED_PERCENTAGE', 'FIXED_AMOUNT', 'VARIABLE_PERCENTAGE', 'VARIABLE_AMOUNT']
    },
    amountMoney: { 
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' }
      }
    },
    pinRequired: { type: 'boolean' },
    labelColor: { type: 'string' },
    // Modifier list specific fields
    selectionType: {
      type: 'string',
      enum: ['SINGLE', 'MULTIPLE']
    },
    modifiers: { type: 'array' },
    // Image specific fields
    url: { type: 'string' },
    caption: { type: 'string' },
    // Common fields
    imageIds: { type: 'array' },
    idempotencyKey: { type: 'string' }
  }
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
      error: error.details || error.toString()
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
    
    const result = await catalogService.deleteCatalogItem(
      req.user.squareAccessToken,
      id
    );
    
    res.json(result);
  } catch (error) {
    console.error(`Error deleting catalog item ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete catalog item',
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/search
 * @desc Search catalog items
 * @access Private
 */
router.post('/search', protect, async (req, res) => {
  try {
    const result = await catalogService.searchCatalogItems(
      req.user.squareAccessToken,
      req.body
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error searching catalog items:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to search catalog items',
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/batch-retrieve
 * @desc Batch retrieve catalog objects
 * @access Private
 */
router.post('/batch-retrieve', protect, validateRequest({
  body: {
    objectIds: { type: 'array', required: true },
    includeRelatedObjects: { type: 'boolean' }
  }
}), async (req, res) => {
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
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/batch-upsert
 * @desc Batch upsert catalog objects
 * @access Private
 */
router.post('/batch-upsert', protect, validateRequest({
  body: {
    batches: { 
      type: 'array',
      required: true,
      items: {
        type: 'object',
        properties: {
          objects: { type: 'array', required: true }
        }
      }
    }
  }
}), async (req, res) => {
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
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/batch-delete
 * @desc Batch delete catalog objects
 * @access Private
 */
router.post('/batch-delete', protect, validateRequest({
  body: {
    objectIds: { type: 'array', required: true }
  }
}), async (req, res) => {
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
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/item/:id/modifier-lists
 * @desc Update item modifier lists
 * @access Private
 */
router.post('/item/:id/modifier-lists', protect, validateRequest({
  body: {
    modifierListsToEnable: { type: 'array' },
    modifierListsToDisable: { type: 'array' }
  }
}), async (req, res) => {
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
      error: error.details || error.toString()
    });
  }
});

/**
 * @route POST /api/catalog/item/:id/taxes
 * @desc Update item taxes
 * @access Private
 */
router.post('/item/:id/taxes', protect, validateRequest({
  body: {
    taxesToEnable: { type: 'array' },
    taxesToDisable: { type: 'array' }
  }
}), async (req, res) => {
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
      error: error.details || error.toString()
    });
  }
});

module.exports = router; 