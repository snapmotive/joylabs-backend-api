/**
 * Square Catalog Service
 * Provides methods to interact with Square Catalog API
 */
const axios = require('axios');
const { getSquareClient } = require('./square');
const { handleSquareError } = require('../utils/errorHandling');
const CatalogItem = require('../models/CatalogItem');
const uuid = require('uuid');
const squareService = require('./square');
const squareErrorHandler = require('../utils/errorHandling');

// Square API version configuration - centralized for easy updates
const SQUARE_API_VERSION = 'v2';
// Square API header version - updated to latest available version
const SQUARE_API_HEADER_VERSION = '2025-03-19';

// Default catalog image size dimensions
const DEFAULT_IMAGE_SIZE = { width: 300, height: 300 };

/**
 * List catalog items
 * @param {string} accessToken - Square access token
 * @param {Object} options - Catalog listing options
 * @returns {Promise<Object>} Catalog items response
 */
async function listCatalogItems(accessToken, options = {}) {
  try {
    console.log('=== REQUEST BOUNDARY: listCatalogItems START ===');
    console.log(
      'Listing catalog items from Square with options:',
      JSON.stringify(options, null, 2)
    );

    // Determine cache key based on options
    const optionsHash = JSON.stringify({
      types: options.types || ['ITEM', 'CATEGORY'],
      limit: options.limit || 100,
      cursor: options.cursor || null,
      includeRelatedObjects:
        options.includeRelatedObjects === true || options.includeRelatedObjects === 'true',
      includeDeletedObjects:
        options.includeDeletedObjects === true || options.includeDeletedObjects === 'true',
    });

    const cacheKey = `catalog-items-${accessToken}-${Buffer.from(optionsHash).toString('base64')}`;

    // Check cache first
    const cachedData = squareService.getCachedResponse(cacheKey, 'catalogItems');
    if (cachedData) {
      console.log('Using cached catalog items data');
      console.log('=== REQUEST BOUNDARY: listCatalogItems END (Cached) ===');
      return cachedData;
    }

    // Use executeSquareRequest to handle retries and errors
    const result = await squareService.executeSquareRequest(
      async client => {
        // Parse options
        const types = options.types || ['ITEM', 'CATEGORY'];
        const typesArray = Array.isArray(types) ? types : types.split(',');
        const limit = options.limit ? parseInt(options.limit) : 100;
        const cursor = options.cursor || null;
        const includeRelatedObjects =
          options.includeRelatedObjects === true || options.includeRelatedObjects === 'true';
        const includeDeletedObjects =
          options.includeDeletedObjects === true || options.includeDeletedObjects === 'true';

        console.log('Making ListCatalog call with params:', {
          types: typesArray,
          limit,
          cursor,
          includeRelatedObjects,
          includeDeletedObjects,
        });

        // Call Square SDK method with appropriate parameters
        return client.catalog.listCatalog(
          typesArray,
          cursor,
          limit,
          includeDeletedObjects,
          includeRelatedObjects
        );
      },
      accessToken,
      'catalog-api' // Use catalog-specific rate limiting
    );

    console.log('=== REQUEST BOUNDARY: listCatalogItems END ===');
    console.log('Successfully retrieved catalog items:', {
      count: result.result.objects?.length || 0,
      cursor: result.result.cursor ? 'Present' : 'None',
    });

    const response = {
      success: true,
      objects: result.result.objects || [],
      cursor: result.result.cursor,
      types: options.types || ['ITEM', 'CATEGORY'],
    };

    // Cache the result
    squareService.cacheResponse(cacheKey, response, 'catalogItems');

    return response;
  } catch (error) {
    console.error('Error listing catalog items:', error);
    return squareErrorHandler.handleSquareError(error, 'Failed to list catalog items');
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

    const response = await client.catalog.retrieveCatalogObject(itemId, true);

    return {
      success: true,
      catalogObject: response.result.object,
      relatedObjects: response.result.relatedObjects || [],
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
    version: itemData.version,
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
        categories: itemData.categories || [],
      };
      break;

    case 'CATEGORY':
      catalogObject.categoryData = {
        name: itemData.name,
        imageIds: itemData.imageIds || [],
      };
      break;

    case 'TAX':
      catalogObject.taxData = {
        name: itemData.name,
        calculationPhase: itemData.calculationPhase || 'TAX_SUBTOTAL_PHASE',
        inclusionType: itemData.inclusionType || 'ADDITIVE',
        percentage: itemData.percentage,
        appliesToCustomAmounts: itemData.appliesToCustomAmounts || false,
        enabled: itemData.enabled || true,
      };
      break;

    case 'DISCOUNT':
      catalogObject.discountData = {
        name: itemData.name,
        discountType: itemData.discountType || 'FIXED_PERCENTAGE',
        percentage: itemData.percentage,
        amountMoney: itemData.amountMoney,
        pinRequired: itemData.pinRequired || false,
        labelColor: itemData.labelColor,
      };
      break;

    case 'MODIFIER_LIST':
      catalogObject.modifierListData = {
        name: itemData.name,
        selectionType: itemData.selectionType || 'SINGLE',
        modifiers: itemData.modifiers || [],
        imageIds: itemData.imageIds || [],
      };
      break;

    case 'MODIFIER':
      catalogObject.modifierData = {
        name: itemData.name,
        priceMoney: itemData.priceMoney,
        ordinal: itemData.ordinal || 0,
        modifierListId: itemData.modifierListId,
        imageIds: itemData.imageIds || [],
      };
      break;

    case 'IMAGE':
      catalogObject.imageData = {
        name: itemData.name,
        url: itemData.url,
        caption: itemData.caption,
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

    const idempotencyKey = itemData.idempotencyKey || uuid.v4();
    const catalogObject = prepareCatalogObject(itemData);

    console.log(`Using idempotency key: ${idempotencyKey}`);
    console.log(`Object type: ${catalogObject.type}`);

    const request = {
      idempotencyKey,
      object: catalogObject,
    };

    const response = await client.catalog.upsertCatalogObject(request);

    // Store reference in our database
    try {
      // Get merchant info using squareService
      const merchantInfo = await squareService.getMerchantInfo(accessToken);

      await CatalogItem.create({
        id: uuid.v4(),
        square_catalog_id: response.result.catalogObject.id,
        name: catalogObject.itemData?.name || catalogObject.categoryData?.name || 'Unnamed Item',
        type: catalogObject.type,
        merchant_id: merchantInfo.id,
        metadata: {
          idempotencyKey,
          version: response.result.catalogObject.version,
        },
      });
    } catch (dbError) {
      console.error('Error storing catalog item reference:', dbError);
    }

    return {
      success: true,
      catalogObject: response.result.catalogObject,
      idempotencyKey,
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

    const response = await client.catalog.deleteCatalogObject(itemId);

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
      deletedObjectId: itemId,
    };
  } catch (error) {
    console.error(`Error deleting catalog item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to delete catalog item');
  }
}

/**
 * Helper function to build a properly formatted Square catalog search request
 * @param {Object} params - Search parameters
 * @returns {Object} Properly formatted search request
 */
function buildCatalogSearchRequest(params = {}) {
  // Make a copy to avoid modifying the original
  const paramsCopy = JSON.parse(JSON.stringify(params));

  const {
    object_types = ['ITEM'],
    cursor,
    limit = 100,
    include_deleted_objects = false,
    include_related_objects = false,
    begin_time,
    query = {},
    include_category_path_to_root = false,
  } = paramsCopy;

  // Build the base request
  const searchRequest = {
    object_types: Array.isArray(object_types) ? object_types : [object_types],
    cursor,
    limit,
    include_deleted_objects,
    include_related_objects,
    begin_time,
    include_category_path_to_root,
  };

  // Initialize a valid query object
  searchRequest.query = {};

  // Check if the query parameter has valid query types
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

  // Handle special case: if the query object exists but is empty {}
  if (query && typeof query === 'object' && Object.keys(query).length === 0) {
    console.log('Query object is empty, using default text_query');
    searchRequest.query.text_query = { query: '' };
    return searchRequest;
  }

  // Check if the query contains at least one valid query type
  const hasQueryType =
    query &&
    typeof query === 'object' &&
    Object.keys(query).some(key => validQueryTypes.includes(key));

  if (hasQueryType) {
    console.log(
      'Found valid query types:',
      Object.keys(query).filter(key => validQueryTypes.includes(key))
    );
    // Copy all valid query types
    validQueryTypes.forEach(queryType => {
      if (query[queryType]) {
        searchRequest.query[queryType] = query[queryType];
      }
    });
  } else {
    console.log('No valid query types found, using default text_query');
    // If no query type was provided, include a default empty text_query
    // This satisfies Square's requirement that "Query must have exactly one query type set"
    searchRequest.query.text_query = { query: '' };
  }

  // Final validation: ensure query has exactly one field
  const queryKeys = Object.keys(searchRequest.query);
  if (queryKeys.length === 0) {
    console.log('No query types after processing, adding default text_query');
    searchRequest.query.text_query = { query: '' };
  } else if (queryKeys.length > 1) {
    console.log('Multiple query types found, keeping only the first one:', queryKeys[0]);
    const firstKey = queryKeys[0];
    const firstValue = searchRequest.query[firstKey];
    searchRequest.query = { [firstKey]: firstValue };
  }

  return searchRequest;
}

/**
 * Search catalog items
 * @param {string} accessToken - Square access token
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Search results
 */
async function searchCatalogItems(accessToken, searchParams = {}) {
  try {
    console.log('=== REQUEST BOUNDARY: searchCatalogItems START ===');
    console.log(
      'Searching catalog objects in Square with params:',
      JSON.stringify(searchParams, null, 2)
    );

    // Create the request body based on searchParams, converting snake_case to camelCase if needed
    const searchRequest = {};

    // Only add parameters that are provided
    if (searchParams.objectTypes || searchParams.object_types) {
      searchRequest.objectTypes = searchParams.objectTypes || searchParams.object_types;
    }

    if (searchParams.limit) {
      searchRequest.limit = parseInt(searchParams.limit);
    }

    if (searchParams.cursor) {
      searchRequest.cursor = searchParams.cursor;
    }

    if (searchParams.includeDeletedObjects || searchParams.include_deleted_objects) {
      searchRequest.includeDeletedObjects =
        searchParams.includeDeletedObjects || searchParams.include_deleted_objects;
    }

    if (searchParams.includeRelatedObjects || searchParams.include_related_objects) {
      searchRequest.includeRelatedObjects =
        searchParams.includeRelatedObjects || searchParams.include_related_objects;
    }

    if (searchParams.beginTime || searchParams.begin_time) {
      searchRequest.beginTime = searchParams.beginTime || searchParams.begin_time;
    }

    if (searchParams.includeCategoryPathToRoot || searchParams.include_category_path_to_root) {
      searchRequest.includeCategoryPathToRoot =
        searchParams.includeCategoryPathToRoot || searchParams.include_category_path_to_root;
    }

    // Keep the original query if provided
    if (searchParams.query) {
      searchRequest.query = searchParams.query;
      console.log('Using query from input:', Object.keys(searchParams.query)[0]);
    }

    console.log(
      'Final search request being sent to Square:',
      JSON.stringify(searchRequest, null, 2)
    );

    // Use executeSquareRequest to handle retries and rate limiting
    const result = await squareService.executeSquareRequest(
      async client => {
        return client.catalog.searchCatalogObjects(searchRequest);
      },
      accessToken,
      'catalog-api'
    );

    console.log('=== REQUEST BOUNDARY: searchCatalogItems END ===');
    console.log('Results retrieved:', {
      count: result.result.objects?.length || 0,
      cursor: result.result.cursor ? 'Present' : 'None',
    });

    return {
      success: true,
      objects: result.result.objects || [],
      relatedObjects: result.result.relatedObjects || [],
      cursor: result.result.cursor,
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

    const response = await client.catalog.batchRetrieveCatalogObjects({
      objectIds,
      includeRelatedObjects,
    });

    return {
      success: true,
      objects: response.result.objects || [],
      relatedObjects: response.result.relatedObjects || [],
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
    const catalogApi = client.catalog;

    const idempotencyKey = uuid.v4();
    const response = await catalogApi.batchUpsertCatalogObjects({
      idempotencyKey,
      batches,
    });

    return {
      success: true,
      objects: response.result.objects || [],
      updatedAt: response.result.updatedAt,
      idempotencyKey,
    };
  } catch (error) {
    console.error('Error batch upserting catalog objects:', error);
    return handleSquareError(error, 'Failed to batch upsert catalog objects');
  }
}

/**
 * Batch delete catalog objects
 * @param {string} accessToken - Square access token
 * @param {Array<string>} objectIds - Array of catalog object IDs to delete
 * @returns {Promise<Object>} Delete response
 */
async function batchDeleteCatalogObjects(accessToken, objectIds) {
  try {
    if (!objectIds || !Array.isArray(objectIds) || objectIds.length === 0) {
      return {
        success: false,
        error: 'No catalog object IDs provided for deletion',
      };
    }

    console.log(`Batch deleting ${objectIds.length} catalog objects`);
    const client = getSquareClient(accessToken);

    // Square API requires a BatchDeleteCatalogObjectsRequest object
    const request = {
      objectIds: objectIds,
    };

    const response = await client.catalog.batchDeleteCatalogObjects(request);

    console.log('Successfully deleted catalog objects');
    console.log(
      'Deleted IDs count:',
      response.result.deletedObjectIds ? response.result.deletedObjectIds.length : 0
    );

    // Remove from our database - Fix N+1 pattern by using batch operation
    try {
      // Get references to all objects in a single query
      const localItemPromises = objectIds.map(objectId =>
        CatalogItem.findBySquareCatalogId(objectId)
      );

      const localItems = await Promise.all(localItemPromises);
      const validLocalItems = localItems.filter(item => item !== null);

      if (validLocalItems.length > 0) {
        // For better performance, use a batch delete operation if available
        console.log(`Found ${validLocalItems.length} local items to remove`);

        // If your DB has batch remove capability
        if (typeof CatalogItem.batchRemove === 'function') {
          const itemIds = validLocalItems.map(item => item.id);
          await CatalogItem.batchRemove(itemIds);
          console.log(`Batch removed ${itemIds.length} catalog item references`);
        } else {
          // Fall back to parallel deletion if batch not available
          await Promise.all(validLocalItems.map(item => CatalogItem.remove(item.id)));
          console.log(`Removed ${validLocalItems.length} catalog item references in parallel`);
        }
      }
    } catch (dbError) {
      console.error('Error removing catalog item references:', dbError);
    }

    return {
      success: true,
      deletedObjectIds: response.result.deletedObjectIds || [],
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
async function updateItemModifierLists(
  accessToken,
  itemId,
  modifierListsToEnable = [],
  modifierListsToDisable = []
) {
  try {
    console.log(`Updating modifier lists for item: ${itemId}`);
    const client = getSquareClient(accessToken);
    const catalogApi = client.catalog;

    const response = await catalogApi.updateItemModifierLists({
      itemIds: [itemId],
      modifierListsToEnable,
      modifierListsToDisable,
    });

    return {
      success: true,
      updatedAt: response.result.updatedAt,
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
    const catalogApi = client.catalog;

    const response = await catalogApi.updateItemTaxes({
      itemIds: [itemId],
      taxesToEnable,
      taxesToDisable,
    });

    return {
      success: true,
      updatedAt: response.result.updatedAt,
    };
  } catch (error) {
    console.error(`Error updating taxes for item ${itemId}:`, error);
    return handleSquareError(error, 'Failed to update item taxes');
  }
}

/**
 * Get catalog categories
 * @param {string} accessToken - Square access token
 * @returns {Promise<Object>} List of catalog categories
 */
async function getCatalogCategories(accessToken) {
  try {
    console.log('=== REQUEST BOUNDARY: getCatalogCategories START ===');

    // Check cache first
    const cacheKey = `catalog-categories-${accessToken}`;
    const cachedData = squareService.getCachedResponse(cacheKey, 'catalogCategories');
    if (cachedData) {
      console.log('Using cached catalog categories data');
      return cachedData;
    }

    console.log('Getting catalog categories from Square');

    // Use direct axios approach to ensure proper query formatting
    const axios = require('axios');

    // Following Square's documentation for finding categories - try both approaches:
    // 1. For top-level categories, use range_query on is_top_level
    // 2. For all categories, use exact_query on name as fallback
    const searchRequest = {
      object_types: ['CATEGORY'],
      limit: 200,
      include_related_objects: true,
      query: {
        range_query: {
          attribute_name: 'is_top_level',
          attribute_max_value: 1,
          attribute_min_value: 1,
        },
      },
    };

    console.log('Category search request:', JSON.stringify(searchRequest, null, 2));

    // Make direct API call to Square
    console.log('Making API call to Square for categories...');
    const response = await axios({
      method: 'post',
      url: `https://connect.squareup.com/${SQUARE_API_VERSION}/catalog/search`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_API_HEADER_VERSION,
      },
      data: searchRequest,
    });

    console.log('Square response status:', response.status);
    console.log('Response headers:', JSON.stringify(response.headers, null, 2));
    console.log(
      'Response data structure:',
      Object.keys(response.data).length === 0
        ? 'Empty response body'
        : JSON.stringify(
            {
              objects_array_length: response.data.objects ? response.data.objects.length : 0,
              objects_present: !!response.data.objects,
              related_objects_present: !!response.data.related_objects,
              cursor_present: !!response.data.cursor,
            },
            null,
            2
          )
    );

    if (!response.data.objects || response.data.objects.length === 0) {
      console.log('No top-level categories found, trying fallback query to find all categories...');

      // Fallback to our previous approach if no categories found
      const fallbackRequest = {
        object_types: ['CATEGORY'],
        limit: 200,
        include_related_objects: true,
        query: {
          exact_query: {
            attribute_name: 'name',
            attribute_value: '.', // Use a very common character to match almost everything
          },
        },
      };

      console.log('Fallback category search request:', JSON.stringify(fallbackRequest, null, 2));

      const fallbackResponse = await axios({
        method: 'post',
        url: `https://connect.squareup.com/${SQUARE_API_VERSION}/catalog/search`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Square-Version': SQUARE_API_HEADER_VERSION,
        },
        data: fallbackRequest,
      });

      console.log('Fallback response status:', fallbackResponse.status);
      console.log(
        'Fallback objects found:',
        fallbackResponse.data.objects ? fallbackResponse.data.objects.length : 0
      );

      console.log('=== REQUEST BOUNDARY: getCatalogCategories END (Success) ===');

      const result = {
        success: true,
        categories: fallbackResponse.data.objects || [],
        relatedObjects: fallbackResponse.data.related_objects || [],
        cursor: fallbackResponse.data.cursor,
      };

      // Cache the result
      squareService.cacheResponse(cacheKey, result, 'catalogCategories');

      return result;
    }

    console.log('=== REQUEST BOUNDARY: getCatalogCategories END (Success) ===');

    // Process the response data
    const result = {
      success: true,
      categories: response.data.objects || [],
      relatedObjects: response.data.related_objects || [],
      cursor: response.data.cursor,
    };

    // Cache the result
    squareService.cacheResponse(cacheKey, result, 'catalogCategories');

    return result;
  } catch (error) {
    console.error('=== REQUEST BOUNDARY: getCatalogCategories END (Error) ===');
    console.error(
      'Error getting catalog categories:',
      error.response ? error.response.data : error
    );

    if (error.response && error.response.data) {
      return {
        success: false,
        error: {
          message: error.response.data.errors?.[0]?.detail || 'Failed to get catalog categories',
          code: error.response.data.errors?.[0]?.code || 'UNKNOWN_ERROR',
          details: error.response.data.errors || [],
        },
      };
    }

    return handleSquareError(error, 'Failed to get catalog categories');
  }
}

/**
 * List catalog categories only (without DynamoDB)
 * A simplified version of listCatalogItems that doesn't try to access DynamoDB
 * @param {string} accessToken - Square access token
 * @param {Object} options - List options
 * @returns {Promise<Object>} List of catalog categories
 */
async function listCatalogCategories(accessToken, options = {}) {
  try {
    console.log('=== REQUEST BOUNDARY: listCatalogCategories START ===');
    console.log('Listing catalog categories from Square - simplified call without DB access');

    const client = getSquareClient(accessToken);
    const catalogApi = client.catalog;

    // Force options to only get categories
    const { limit = 200, cursor } = options;

    // Make direct API call to Square
    const axios = require('axios');

    console.log(
      'Making ListCatalog request with params:',
      JSON.stringify(
        {
          object_types: ['CATEGORY'],
          limit,
          cursor,
        },
        null,
        2
      )
    );

    // Make direct API call to avoid SDK parameter order issues
    const response = await axios({
      method: 'get',
      url: `https://connect.squareup.com/${SQUARE_API_VERSION}/catalog/list`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_API_HEADER_VERSION,
      },
      params: {
        types: 'CATEGORY',
        limit,
        cursor,
      },
    });

    if (response?.data) {
      console.log(
        'ListCatalog response successful. Objects count:',
        response.data.objects ? response.data.objects.length : 0
      );

      if (response.data.objects && response.data.objects.length > 0) {
        console.log(
          'First few categories:',
          response.data.objects.slice(0, 3).map(obj => ({
            id: obj.id,
            type: obj.type,
            name: obj.category_data?.name || 'Unknown',
          }))
        );
      } else {
        console.log('Warning: No categories returned. This might indicate:');
        console.log('1. There are no categories in the Square account');
        console.log('2. The token might not have access to the requested catalog categories');
        console.log('3. The merchant account might be empty or incorrectly configured');
      }
    } else {
      console.log('Warning: Unexpected response format from Square:', response);
    }

    console.log('=== REQUEST BOUNDARY: listCatalogCategories END (Success) ===');

    return {
      success: true,
      objects: response.data.objects || [],
      cursor: response.data.cursor,
      count: response.data.objects ? response.data.objects.length : 0,
    };
  } catch (error) {
    console.error('=== REQUEST BOUNDARY: listCatalogCategories END (Error) ===');
    console.error(
      'Error listing catalog categories:',
      error.response ? error.response.data : error
    );
    console.error('Square API Error:', error);

    if (error.response && error.response.data) {
      return {
        success: false,
        error: {
          message: error.response.data.errors?.[0]?.detail || 'Failed to list catalog categories',
          code: error.response.data.errors?.[0]?.code || 'UNKNOWN_ERROR',
          details: error.response.data.errors || [],
        },
      };
    }

    return handleSquareError(error, 'Failed to list catalog categories');
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
  updateItemTaxes,
  getCatalogCategories,
  listCatalogCategories,
};
