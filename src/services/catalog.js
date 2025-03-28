/**
 * Square Catalog Service
 * Provides methods to interact with Square Catalog API
 */
const { getSquareClient } = require('./square');
const { handleSquareError } = require('../utils/errorHandling');
const CatalogItem = require('../models/CatalogItem');
const uuid = require('uuid');

// Default catalog image size dimensions
const DEFAULT_IMAGE_SIZE = { width: 300, height: 300 };

/**
 * List catalog items
 * @param {string} accessToken - Square access token
 * @param {Object} options - List options
 * @returns {Promise<Object>} List of catalog items
 */
async function listCatalogItems(accessToken, options = {}) {
  try {
    console.log('Listing catalog items from Square');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const { types = ['ITEM', 'CATEGORY'], page = 1, limit = 20 } = options;
    
    // Convert types to array if it's a string
    const typesArray = Array.isArray(types) ? types : types.split(',');
    
    // Calculate cursor based on page and limit
    let cursor = undefined;
    if (page > 1) {
      cursor = `page_${page - 1}`;
    }
    
    // Set up the request options
    const request = {
      types: typesArray,
      limit
    };
    
    if (cursor) {
      request.cursor = cursor;
    }
    
    const response = await catalogApi.listCatalog(request);
    
    return {
      success: true,
      objects: response.result.objects || [],
      cursor: response.result.cursor,
      count: response.result.objects ? response.result.objects.length : 0
    };
  } catch (error) {
    console.error('Error listing catalog items:', error);
    return handleSquareError(error, 'Failed to list catalog items');
  }
}

/**
 * Get catalog item by ID
 * @param {string} accessToken - Square access token
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<Object>} Catalog item
 */
async function getCatalogItem(accessToken, itemId) {
  try {
    console.log(`Getting catalog item: ${itemId}`);
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.retrieveCatalogObject(itemId, true);
    
    return {
      success: true,
      catalogObject: response.result.object,
      relatedObjects: response.result.relatedObjects || []
    };
  } catch (error) {
    console.error(`Error getting catalog item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to get catalog item');
  }
}

/**
 * Helper function to prepare catalog object from item data
 * @param {Object} itemData - Item data
 * @returns {Object} Prepared catalog object
 */
function prepareCatalogObject(itemData) {
  // Base object structure
  const catalogObject = {
    type: itemData.type || 'ITEM',
    id: itemData.id || `#${uuid.v4()}`,
    presentAtAllLocations: true,
    version: itemData.version
  };
  
  // Handle different object types
  switch (catalogObject.type) {
    case 'ITEM':
      catalogObject.itemData = {
        name: itemData.name,
        description: itemData.description,
        abbreviation: itemData.abbreviation,
        productType: itemData.productType || 'REGULAR',
        categoryId: itemData.categoryId,
        taxIds: itemData.taxIds || [],
        variations: itemData.variations || [],
        imageIds: itemData.imageIds || [],
        isArchived: itemData.isArchived || false,
        availableOnline: itemData.availableOnline || false,
        availableForPickup: itemData.availableForPickup || false,
        availableElectronically: itemData.availableElectronically || false,
        skipModifierScreen: itemData.skipModifierScreen || false,
        sortName: itemData.sortName,
        modifierListInfo: itemData.modifierListInfo || [],
        categories: itemData.categories || []
      };
      break;
      
    case 'CATEGORY':
      catalogObject.categoryData = {
        name: itemData.name,
        imageIds: itemData.imageIds || []
      };
      break;
      
    case 'TAX':
      catalogObject.taxData = {
        name: itemData.name,
        calculationPhase: itemData.calculationPhase || 'TAX_SUBTOTAL_PHASE',
        inclusionType: itemData.inclusionType || 'ADDITIVE',
        percentage: itemData.percentage,
        appliesToCustomAmounts: itemData.appliesToCustomAmounts || false,
        enabled: itemData.enabled || true
      };
      break;
      
    case 'DISCOUNT':
      catalogObject.discountData = {
        name: itemData.name,
        discountType: itemData.discountType || 'FIXED_PERCENTAGE',
        percentage: itemData.percentage,
        amountMoney: itemData.amountMoney,
        pinRequired: itemData.pinRequired || false,
        labelColor: itemData.labelColor
      };
      break;
      
    case 'MODIFIER_LIST':
      catalogObject.modifierListData = {
        name: itemData.name,
        selectionType: itemData.selectionType || 'SINGLE',
        modifiers: itemData.modifiers || [],
        imageIds: itemData.imageIds || []
      };
      break;
      
    case 'MODIFIER':
      catalogObject.modifierData = {
        name: itemData.name,
        priceMoney: itemData.priceMoney,
        ordinal: itemData.ordinal || 0,
        modifierListId: itemData.modifierListId,
        imageIds: itemData.imageIds || []
      };
      break;
      
    case 'IMAGE':
      catalogObject.imageData = {
        name: itemData.name,
        url: itemData.url,
        caption: itemData.caption
      };
      break;
      
    default:
      throw new Error(`Unsupported catalog object type: ${catalogObject.type}`);
  }
  
  return catalogObject;
}

/**
 * Create or update catalog item
 * @param {string} accessToken - Square access token
 * @param {Object} itemData - Item data to create or update
 * @returns {Promise<Object>} Created/updated catalog item
 */
async function createOrUpdateCatalogItem(accessToken, itemData) {
  try {
    console.log('Creating/updating catalog item in Square');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const idempotencyKey = itemData.idempotencyKey || uuid.v4();
    const catalogObject = prepareCatalogObject(itemData);
    
    console.log(`Using idempotency key: ${idempotencyKey}`);
    console.log(`Object type: ${catalogObject.type}`);
    
    const request = {
      idempotencyKey,
      object: catalogObject
    };
    
    const response = await catalogApi.upsertCatalogObject(request);
    
    // Store reference in our database
    try {
      const { merchant_id } = await client.merchantsApi.retrieveMerchant('me');
      
      await CatalogItem.create({
        id: uuid.v4(),
        square_catalog_id: response.result.catalogObject.id,
        name: catalogObject.itemData?.name || catalogObject.categoryData?.name || 'Unnamed Item',
        type: catalogObject.type,
        merchant_id: merchant_id,
        metadata: {
          idempotencyKey,
          version: response.result.catalogObject.version
        }
      });
    } catch (dbError) {
      console.error('Error storing catalog item reference:', dbError);
    }
    
    return {
      success: true,
      catalogObject: response.result.catalogObject,
      idempotencyKey
    };
  } catch (error) {
    console.error('Error creating/updating catalog item:', error);
    return handleSquareError(error, 'Failed to create/update catalog item');
  }
}

/**
 * Delete catalog item
 * @param {string} accessToken - Square access token
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteCatalogItem(accessToken, itemId) {
  try {
    console.log(`Deleting catalog item: ${itemId}`);
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.deleteCatalogObject(itemId);
    
    // Remove from our database if it exists
    try {
      const localItem = await CatalogItem.findBySquareCatalogId(itemId);
      if (localItem) {
        await CatalogItem.remove(localItem.id);
      }
    } catch (dbError) {
      console.error('Error removing catalog item reference:', dbError);
    }
    
    return {
      success: true,
      deletedObjectId: itemId
    };
  } catch (error) {
    console.error(`Error deleting catalog item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to delete catalog item');
  }
}

/**
 * Search catalog items
 * @param {string} accessToken - Square access token
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Search results
 */
async function searchCatalogItems(accessToken, searchParams = {}) {
  try {
    console.log('Searching catalog items in Square');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const { 
      query = '', 
      types = ['ITEM'], 
      categoryIds = [],
      limit = 20,
      cursor,
      customAttributeFilters = [],
      stockLevels = [],
      enabledLocationIds = [],
      sortOrder = 'ASC'
    } = searchParams;
    
    // Build search query
    const searchRequest = {
      objectTypes: Array.isArray(types) ? types : [types],
      query: {
        exactQuery: query.exact ? { attributeName: query.exact.field, attributeValue: query.exact.value } : undefined,
        prefixQuery: query.prefix ? { attributeName: query.prefix.field, attributePrefix: query.prefix.value } : undefined,
        textQuery: query.text ? { keywords: Array.isArray(query.text) ? query.text : [query.text] } : undefined
      },
      limit,
      cursor,
      locationIds: enabledLocationIds,
      sortOrder
    };
    
    // Add category filter if provided
    if (categoryIds.length > 0) {
      searchRequest.categoryIds = Array.isArray(categoryIds) ? categoryIds : [categoryIds];
    }
    
    // Add custom attribute filters if provided
    if (customAttributeFilters.length > 0) {
      searchRequest.customAttributeFilters = customAttributeFilters;
    }
    
    // Add stock level filter if provided
    if (stockLevels.length > 0) {
      searchRequest.stockLevels = stockLevels;
    }
    
    const response = await catalogApi.searchCatalogObjects(searchRequest);
    
    return {
      success: true,
      objects: response.result.objects || [],
      cursor: response.result.cursor,
      count: response.result.objects ? response.result.objects.length : 0,
      matchedVariationIds: response.result.matchedVariationIds || []
    };
  } catch (error) {
    console.error('Error searching catalog items:', error);
    return handleSquareError(error, 'Failed to search catalog items');
  }
}

/**
 * Batch retrieve catalog objects
 * @param {string} accessToken - Square access token
 * @param {string[]} objectIds - Array of catalog object IDs
 * @param {boolean} includeRelatedObjects - Whether to include related objects
 * @returns {Promise<Object>} Retrieved catalog objects
 */
async function batchRetrieveCatalogObjects(accessToken, objectIds, includeRelatedObjects = true) {
  try {
    console.log('Batch retrieving catalog objects');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.batchRetrieveCatalogObjects({
      objectIds,
      includeRelatedObjects
    });
    
    return {
      success: true,
      objects: response.result.objects || [],
      relatedObjects: response.result.relatedObjects || []
    };
  } catch (error) {
    console.error('Error batch retrieving catalog objects:', error);
    return handleSquareError(error, 'Failed to batch retrieve catalog objects');
  }
}

/**
 * Batch upsert catalog objects
 * @param {string} accessToken - Square access token
 * @param {Object[]} batches - Array of catalog object batches
 * @returns {Promise<Object>} Upserted catalog objects
 */
async function batchUpsertCatalogObjects(accessToken, batches) {
  try {
    console.log('Batch upserting catalog objects');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const idempotencyKey = uuid.v4();
    const response = await catalogApi.batchUpsertCatalogObjects({
      idempotencyKey,
      batches
    });
    
    return {
      success: true,
      objects: response.result.objects || [],
      updatedAt: response.result.updatedAt,
      idempotencyKey
    };
  } catch (error) {
    console.error('Error batch upserting catalog objects:', error);
    return handleSquareError(error, 'Failed to batch upsert catalog objects');
  }
}

/**
 * Batch delete catalog objects
 * @param {string} accessToken - Square access token
 * @param {string[]} objectIds - Array of catalog object IDs
 * @returns {Promise<Object>} Deletion results
 */
async function batchDeleteCatalogObjects(accessToken, objectIds) {
  try {
    console.log('Batch deleting catalog objects');
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.batchDeleteCatalogObjects({
      objectIds
    });
    
    // Remove from our database
    try {
      for (const objectId of objectIds) {
        const localItem = await CatalogItem.findBySquareCatalogId(objectId);
        if (localItem) {
          await CatalogItem.remove(localItem.id);
        }
      }
    } catch (dbError) {
      console.error('Error removing catalog item references:', dbError);
    }
    
    return {
      success: true,
      deletedObjectIds: response.result.deletedObjectIds || [],
      deletedAt: response.result.deletedAt
    };
  } catch (error) {
    console.error('Error batch deleting catalog objects:', error);
    return handleSquareError(error, 'Failed to batch delete catalog objects');
  }
}

/**
 * Update catalog item modifier lists
 * @param {string} accessToken - Square access token
 * @param {string} itemId - Catalog item ID
 * @param {string[]} modifierListsToEnable - Modifier lists to enable
 * @param {string[]} modifierListsToDisable - Modifier lists to disable
 * @returns {Promise<Object>} Update result
 */
async function updateItemModifierLists(accessToken, itemId, modifierListsToEnable = [], modifierListsToDisable = []) {
  try {
    console.log(`Updating modifier lists for item: ${itemId}`);
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.updateItemModifierLists({
      itemIds: [itemId],
      modifierListsToEnable,
      modifierListsToDisable
    });
    
    return {
      success: true,
      updatedAt: response.result.updatedAt
    };
  } catch (error) {
    console.error(`Error updating modifier lists for item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to update item modifier lists');
  }
}

/**
 * Update catalog item taxes
 * @param {string} accessToken - Square access token
 * @param {string} itemId - Catalog item ID
 * @param {string[]} taxesToEnable - Taxes to enable
 * @param {string[]} taxesToDisable - Taxes to disable
 * @returns {Promise<Object>} Update result
 */
async function updateItemTaxes(accessToken, itemId, taxesToEnable = [], taxesToDisable = []) {
  try {
    console.log(`Updating taxes for item: ${itemId}`);
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalogApi;
    
    const response = await catalogApi.updateItemTaxes({
      itemIds: [itemId],
      taxesToEnable,
      taxesToDisable
    });
    
    return {
      success: true,
      updatedAt: response.result.updatedAt
    };
  } catch (error) {
    console.error(`Error updating taxes for item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to update item taxes');
  }
}

module.exports = {
  listCatalogItems,
  getCatalogItem,
  createOrUpdateCatalogItem,
  deleteCatalogItem,
  searchCatalogItems,
  batchRetrieveCatalogObjects,
  batchUpsertCatalogObjects,
  batchDeleteCatalogObjects,
  updateItemModifierLists,
  updateItemTaxes
}; 