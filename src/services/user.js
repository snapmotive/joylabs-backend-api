const AWS = require('aws-sdk');

// Cache AWS clients for connection reuse
let dynamoDbClient = null;
const getDynamoDb = () => {
  if (!dynamoDbClient) {
    const options = process.env.IS_OFFLINE === 'true' ? 
      { region: 'localhost', endpoint: 'http://localhost:8000' } : 
      { maxRetries: 3 };
    dynamoDbClient = new AWS.DynamoDB.DocumentClient(options);
  }
  return dynamoDbClient;
};

// Get table name with environment-specific suffix
const getTableName = (baseName) => {
  const stage = process.env.NODE_ENV || 'development';
  return `${baseName}-v3-${stage}`;
};

/**
 * Get a merchant by ID
 */
exports.getMerchantById = async (merchantId) => {
  if (!merchantId) {
    throw new Error('Merchant ID is required');
  }

  const dynamoDb = getDynamoDb();
  const params = {
    TableName: getTableName('joylabs-merchants'),
    Key: {
      id: merchantId
    }
  };

  try {
    const result = await dynamoDb.get(params).promise();
    return result.Item;
  } catch (error) {
    console.error(`Error getting merchant ${merchantId}:`, error);
    throw error;
  }
};

/**
 * Create a new merchant
 */
exports.createMerchant = async (merchantId, accessToken, refreshToken, expiresAt) => {
  if (!merchantId || !accessToken || !refreshToken || !expiresAt) {
    throw new Error('Missing required merchant information');
  }

  const dynamoDb = getDynamoDb();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year TTL

  const item = {
    id: merchantId,
    accessToken,
    refreshToken,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    ttl
  };

  const params = {
    TableName: getTableName('joylabs-merchants'),
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)'
  };

  try {
    await dynamoDb.put(params).promise();
    return item;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new Error(`Merchant with ID ${merchantId} already exists`);
    }
    console.error(`Error creating merchant ${merchantId}:`, error);
    throw error;
  }
};

/**
 * Update merchant tokens
 */
exports.updateMerchantTokens = async (merchantId, accessToken, refreshToken, expiresAt) => {
  if (!merchantId || !accessToken || !refreshToken || !expiresAt) {
    throw new Error('Missing required merchant information');
  }

  const dynamoDb = getDynamoDb();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year TTL

  const params = {
    TableName: getTableName('joylabs-merchants'),
    Key: {
      id: merchantId
    },
    UpdateExpression: 'SET accessToken = :accessToken, refreshToken = :refreshToken, expiresAt = :expiresAt, updatedAt = :updatedAt, ttl = :ttl',
    ExpressionAttributeValues: {
      ':accessToken': accessToken,
      ':refreshToken': refreshToken,
      ':expiresAt': expiresAt,
      ':updatedAt': now,
      ':ttl': ttl
    },
    ReturnValues: 'ALL_NEW'
  };

  try {
    const result = await dynamoDb.update(params).promise();
    return result.Attributes;
  } catch (error) {
    console.error(`Error updating merchant ${merchantId}:`, error);
    throw error;
  }
};

/**
 * List all merchants
 */
exports.listMerchants = async (limit = 100) => {
  const dynamoDb = getDynamoDb();
  const params = {
    TableName: getTableName('joylabs-merchants'),
    Limit: limit
  };

  try {
    const result = await dynamoDb.scan(params).promise();
    return result.Items;
  } catch (error) {
    console.error('Error listing merchants:', error);
    throw error;
  }
};

/**
 * Delete a merchant by ID
 */
exports.deleteMerchant = async (merchantId) => {
  if (!merchantId) {
    throw new Error('Merchant ID is required');
  }

  const dynamoDb = getDynamoDb();
  const params = {
    TableName: getTableName('joylabs-merchants'),
    Key: {
      id: merchantId
    }
  };

  try {
    await dynamoDb.delete(params).promise();
    return { success: true, message: `Merchant ${merchantId} deleted successfully` };
  } catch (error) {
    console.error(`Error deleting merchant ${merchantId}:`, error);
    throw error;
  }
}; 