/**
 * Catalog Item Model
 * Provides methods to manage Square catalog item IDs in the local database
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const uuid = require('uuid');

// Configure DynamoDB client
const client = new DynamoDBClient({
  maxAttempts: 3,
  requestTimeout: 3000
});
const dynamoDb = DynamoDBDocumentClient.from(client);

// Table name from environment variable
const tableName = process.env.CATALOG_ITEMS_TABLE || 'joylabs-backend-api-v3-catalog-items-v3';

/**
 * Create a new catalog item reference
 * @param {Object} data - Catalog item data
 * @returns {Promise<Object>} Created catalog item
 */
async function create(data) {
  const timestamp = new Date().toISOString();
  const id = data.id || uuid.v4();
  
  const item = {
    id,
    square_catalog_id: data.square_catalog_id,
    name: data.name,
    type: data.type || 'ITEM',
    created_at: timestamp,
    updated_at: timestamp,
    merchant_id: data.merchant_id,
    status: data.status || 'ACTIVE',
    metadata: data.metadata || {}
  };
  
  const params = {
    TableName: tableName,
    Item: item
  };
  
  console.log(`Creating catalog item reference: ${id}`);
  
  try {
    await dynamoDb.send(new PutCommand(params));
    return item;
  } catch (error) {
    console.error('Error creating catalog item reference:', error);
    throw error;
  }
}

/**
 * Get a catalog item reference by ID
 * @param {string} id - Catalog item ID
 * @returns {Promise<Object|null>} Catalog item or null if not found
 */
async function findById(id) {
  const params = {
    TableName: tableName,
    Key: { id }
  };
  
  console.log(`Getting catalog item reference by ID: ${id}`);
  
  try {
    const result = await dynamoDb.send(new GetCommand(params));
    return result.Item || null;
  } catch (error) {
    console.error(`Error getting catalog item reference ${id}:`, error);
    throw error;
  }
}

/**
 * Get a catalog item reference by Square catalog ID
 * @param {string} squareCatalogId - Square catalog ID
 * @returns {Promise<Object|null>} Catalog item or null if not found
 */
async function findBySquareCatalogId(squareCatalogId) {
  const params = {
    TableName: tableName,
    FilterExpression: 'square_catalog_id = :squareCatalogId',
    ExpressionAttributeValues: {
      ':squareCatalogId': squareCatalogId
    }
  };
  
  console.log(`Getting catalog item reference by Square catalog ID: ${squareCatalogId}`);
  
  try {
    const result = await dynamoDb.send(new ScanCommand(params));
    return result.Items[0] || null;
  } catch (error) {
    console.error(`Error getting catalog item reference by Square catalog ID ${squareCatalogId}:`, error);
    throw error;
  }
}

/**
 * Update a catalog item reference
 * @param {string} id - Catalog item ID
 * @param {Object} updates - Properties to update
 * @returns {Promise<Object>} Updated catalog item
 */
async function update(id, updates) {
  const timestamp = new Date().toISOString();
  
  let updateExpression = 'SET updated_at = :timestamp';
  const expressionAttributeValues = {
    ':timestamp': timestamp
  };
  
  Object.keys(updates).forEach(key => {
    if (key !== 'id') {
      updateExpression += `, ${key} = :${key}`;
      expressionAttributeValues[`:${key}`] = updates[key];
    }
  });
  
  const params = {
    TableName: tableName,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };
  
  console.log(`Updating catalog item reference: ${id}`);
  
  try {
    const result = await dynamoDb.send(new UpdateCommand(params));
    return result.Attributes;
  } catch (error) {
    console.error(`Error updating catalog item reference ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a catalog item reference
 * @param {string} id - Catalog item ID
 * @returns {Promise<boolean>} Whether the deletion was successful
 */
async function remove(id) {
  const params = {
    TableName: tableName,
    Key: { id }
  };
  
  console.log(`Deleting catalog item reference: ${id}`);
  
  try {
    await dynamoDb.send(new DeleteCommand(params));
    return true;
  } catch (error) {
    console.error(`Error deleting catalog item reference ${id}:`, error);
    throw error;
  }
}

/**
 * List catalog item references
 * @param {Object} options - Query options
 * @returns {Promise<Array>} List of catalog items
 */
async function list(options = {}) {
  const { limit = 100, startKey = null, merchantId = null } = options;
  
  const params = {
    TableName: tableName,
    Limit: limit
  };
  
  if (startKey) {
    params.ExclusiveStartKey = { id: startKey };
  }
  
  if (merchantId) {
    params.FilterExpression = 'merchant_id = :merchantId';
    params.ExpressionAttributeValues = {
      ':merchantId': merchantId
    };
  }
  
  console.log('Listing catalog item references');
  
  try {
    const result = await dynamoDb.send(new ScanCommand(params));
    return {
      items: result.Items || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count
    };
  } catch (error) {
    console.error('Error listing catalog item references:', error);
    throw error;
  }
}

module.exports = {
  create,
  findById,
  findBySquareCatalogId,
  update,
  remove,
  list
}; 