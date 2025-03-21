const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// For testing/development
const useMockData = process.env.ENABLE_MOCK_DATA === 'true' || process.env.NODE_ENV !== 'production';
const mockUsers = {};

// Initialize DynamoDB client
let dynamoDb;
if (process.env.IS_OFFLINE === 'true') {
  dynamoDb = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  });
} else {
  dynamoDb = new AWS.DynamoDB.DocumentClient();
}

// User model
const User = {
  // Find user by Square merchant ID
  async findBySquareMerchantId(merchantId) {
    if (!merchantId) {
      throw new Error('Merchant ID is required');
    }
    
    console.log(`Looking up user by Square merchant ID: ${merchantId}`);
    
    try {
      // Check if we can use DynamoDB
      if (!process.env.USERS_TABLE) {
        throw new Error('USERS_TABLE environment variable is not set');
      }

      const params = {
        TableName: process.env.USERS_TABLE,
        IndexName: 'SquareMerchantIndex',
        KeyConditionExpression: 'square_merchant_id = :merchantId',
        ExpressionAttributeValues: {
          ':merchantId': merchantId
        }
      };
      
      console.log('Querying DynamoDB with params:', JSON.stringify(params, null, 2));
      
      const result = await dynamoDb.query(params).promise();
      
      if (result.Items && result.Items.length > 0) {
        console.log('Found user in DynamoDB:', result.Items[0].id);
        return result.Items[0];
      }
      
      console.log('No user found with merchant ID:', merchantId);
      return null;
    } catch (error) {
      console.error('Error finding user by Square merchant ID:', error);
      throw error;
    }
  },
  
  // Create a new user
  async create(userData) {
    if (!userData || !userData.square_merchant_id) {
      throw new Error('User data with Square merchant ID is required');
    }

    try {
      if (!process.env.USERS_TABLE) {
        throw new Error('USERS_TABLE environment variable is not set');
      }

      const timestamp = new Date().toISOString();
      const userId = userData.id || `user-${uuidv4()}`;

      const item = {
        id: userId,
        name: userData.name || 'Unknown User',
        email: userData.email,
        square_merchant_id: userData.square_merchant_id,
        square_access_token: userData.square_access_token,
        square_refresh_token: userData.square_refresh_token,
        square_token_expires_at: userData.square_token_expires_at,
        created_at: timestamp,
        updated_at: timestamp
      };

      const params = {
        TableName: process.env.USERS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)'
      };

      console.log('Creating user with params:', JSON.stringify({
        ...params,
        Item: {
          ...params.Item,
          square_access_token: '[REDACTED]',
          square_refresh_token: '[REDACTED]'
        }
      }, null, 2));

      await dynamoDb.put(params).promise();
      console.log('Successfully created user:', userId);

      return item;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },
  
  // Update an existing user
  async update(userId, updateData) {
    if (!userId || !updateData) {
      throw new Error('User ID and update data are required');
    }

    try {
      if (!process.env.USERS_TABLE) {
        throw new Error('USERS_TABLE environment variable is not set');
      }

      const timestamp = new Date().toISOString();
      
      // Build update expression and attribute values
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          const attributeName = `#${key}`;
          const attributeValue = `:${key}`;
          updateExpressions.push(`${attributeName} = ${attributeValue}`);
          expressionAttributeNames[attributeName] = key;
          expressionAttributeValues[attributeValue] = value;
        }
      });

      // Always update the updated_at timestamp
      updateExpressions.push('#updated_at = :updated_at');
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at'] = timestamp;

      const params = {
        TableName: process.env.USERS_TABLE,
        Key: { id: userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      };

      console.log('Updating user with params:', JSON.stringify({
        ...params,
        ExpressionAttributeValues: {
          ...params.ExpressionAttributeValues,
          ':square_access_token': '[REDACTED]',
          ':square_refresh_token': '[REDACTED]'
        }
      }, null, 2));

      const result = await dynamoDb.update(params).promise();
      console.log('Successfully updated user:', userId);

      return result.Attributes;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },
  
  // Generate JWT token for user
  generateToken(userId) {
    // If a user object is passed, extract the ID
    const id = typeof userId === 'object' ? userId.id : userId;
    
    if (!id) {
      throw new Error('Valid user ID is required');
    }
    
    console.log(`Generating JWT token for user: ${id}`);
    
    // Get user data if we have it
    const user = mockUsers[id] || { id };
    
    const payload = {
      sub: id,
      name: user.name,
      email: user.email,
      merchant_id: user.square_merchant_id
    };
    
    // Sign token with secret or use a default for development
    const jwtSecret = process.env.JWT_SECRET || 'development-secret-key';
    
    // Sign token with secret
    const token = jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return token;
  }
};

module.exports = User; 