const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Configure AWS DynamoDB client
const client = new DynamoDBClient({
  maxAttempts: 3,
  requestTimeout: 3000,
  region: process.env.AWS_REGION
});

const dynamoDb = DynamoDBDocumentClient.from(client);

// Get table name
const getTableName = (baseName) => {
  return `${baseName}-v3-production`;
};

/**
 * Get a merchant by ID
 */
exports.getMerchantById = async (merchantId) => {
  if (!merchantId) {
    throw new Error('Merchant ID is required');
  }

  const params = {
    TableName: getTableName('joylabs-merchants'),
    Key: {
      id: merchantId
    }
  };

  try {
    const result = await dynamoDb.send(new GetCommand(params));
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
    await dynamoDb.send(new PutCommand(params));
    return item;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
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
    const result = await dynamoDb.send(new UpdateCommand(params));
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
    const result = await dynamoDb.send(new ScanCommand(params));
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
    await dynamoDb.send(new DeleteCommand(params));
    return { success: true, message: `Merchant ${merchantId} deleted successfully` };
  } catch (error) {
    console.error(`Error deleting merchant ${merchantId}:`, error);
    throw error;
  }
}; 