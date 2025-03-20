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
    
    // Check mock data first if enabled
    if (useMockData) {
      console.log('Using mock data for user lookup');
      const mockUser = Object.values(mockUsers).find(u => u.square_merchant_id === merchantId);
      if (mockUser) {
        console.log('Found user in mock data:', mockUser.id);
        return mockUser;
      }
    }
    
    try {
      // Check if we can use DynamoDB
      let dynamoDbAvailable = true;
      try {
        await dynamoDb.scan({ TableName: process.env.USERS_TABLE, Limit: 1 }).promise();
      } catch (error) {
        console.warn('DynamoDB not available, using only mock data:', error.message);
        dynamoDbAvailable = false;
      }
      
      if (!dynamoDbAvailable) {
        return null;
      }
      
      const params = {
        TableName: process.env.USERS_TABLE,
        IndexName: 'SquareMerchantIndex',
        KeyConditionExpression: 'square_merchant_id = :merchantId',
        ExpressionAttributeValues: {
          ':merchantId': merchantId
        }
      };
      
      const result = await dynamoDb.query(params).promise();
      
      if (result.Items && result.Items.length > 0) {
        console.log('Found user in DynamoDB:', result.Items[0].id);
        return result.Items[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error finding user by Square merchant ID:', error);
      
      // In development, return null rather than throwing
      if (process.env.NODE_ENV !== 'production') {
        console.log('Returning null for user lookup in development');
        return null;
      }
      
      throw error;
    }
  },
  
  // Create a new user
  async create(userData) {
    if (!userData) {
      throw new Error('User data is required');
    }
    
    console.log('Creating new user with data:', JSON.stringify(userData, null, 2));
    
    // Generate a unique ID
    const userId = uuidv4();
    
    // Create user object
    const user = {
      id: userId,
      name: userData.name,
      email: userData.email,
      square_merchant_id: userData.square_merchant_id,
      square_access_token: userData.square_access_token,
      square_refresh_token: userData.square_refresh_token,
      square_token_expires_at: userData.square_token_expires_at,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Use mock data if enabled
    if (useMockData) {
      console.log('Using mock data for user creation');
      mockUsers[userId] = user;
      return user;
    }
    
    try {
      // Check if we can use DynamoDB
      let dynamoDbAvailable = true;
      try {
        await dynamoDb.scan({ TableName: process.env.USERS_TABLE, Limit: 1 }).promise();
      } catch (error) {
        console.warn('DynamoDB not available, using only mock data:', error.message);
        dynamoDbAvailable = false;
      }
      
      if (!dynamoDbAvailable) {
        mockUsers[userId] = user;
        return user;
      }
      
      // Save to DynamoDB
      const params = {
        TableName: process.env.USERS_TABLE,
        Item: user
      };
      
      await dynamoDb.put(params).promise();
      
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      
      // In development, use mock data as fallback
      if (process.env.NODE_ENV !== 'production') {
        console.log('Falling back to mock data for user creation in development');
        mockUsers[userId] = user;
        return user;
      }
      
      throw error;
    }
  },
  
  // Update an existing user
  async update(userId, updateData) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    console.log(`Updating user ${userId} with data:`, JSON.stringify(updateData, null, 2));
    
    // Check mock data first if enabled
    if (useMockData && mockUsers[userId]) {
      console.log('Updating mock user data');
      mockUsers[userId] = {
        ...mockUsers[userId],
        ...updateData,
        updated_at: new Date().toISOString()
      };
      return mockUsers[userId];
    }
    
    try {
      // Check if we can use DynamoDB
      let dynamoDbAvailable = true;
      try {
        await dynamoDb.scan({ TableName: process.env.USERS_TABLE, Limit: 1 }).promise();
      } catch (error) {
        console.warn('DynamoDB not available, using only mock data:', error.message);
        dynamoDbAvailable = false;
      }
      
      if (!dynamoDbAvailable) {
        if (!mockUsers[userId]) {
          throw new Error(`User with ID ${userId} not found`);
        }
        
        mockUsers[userId] = {
          ...mockUsers[userId],
          ...updateData,
          updated_at: new Date().toISOString()
        };
        
        return mockUsers[userId];
      }
      
      // Build update expression
      let updateExpression = 'SET updated_at = :updatedAt';
      const expressionAttributeValues = {
        ':updatedAt': new Date().toISOString()
      };
      
      // Add update fields to expression
      Object.keys(updateData).forEach((key, index) => {
        updateExpression += `, #key${index} = :value${index}`;
        expressionAttributeValues[`:value${index}`] = updateData[key];
      });
      
      // Build expression attribute names
      const expressionAttributeNames = {};
      Object.keys(updateData).forEach((key, index) => {
        expressionAttributeNames[`#key${index}`] = key;
      });
      
      // Update in DynamoDB
      const params = {
        TableName: process.env.USERS_TABLE,
        Key: { id: userId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'ALL_NEW'
      };
      
      const result = await dynamoDb.update(params).promise();
      
      return result.Attributes;
    } catch (error) {
      console.error('Error updating user:', error);
      
      // In development, use mock data as fallback
      if (process.env.NODE_ENV !== 'production') {
        console.log('Falling back to mock data for user update in development');
        
        if (!mockUsers[userId]) {
          mockUsers[userId] = {
            id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
        
        mockUsers[userId] = {
          ...mockUsers[userId],
          ...updateData,
          updated_at: new Date().toISOString()
        };
        
        return mockUsers[userId];
      }
      
      throw error;
    }
  },
  
  // Generate JWT token for user
  generateToken(user) {
    if (!user || !user.id) {
      throw new Error('Valid user object is required');
    }
    
    console.log(`Generating JWT token for user: ${user.id}`);
    
    const payload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      merchant_id: user.square_merchant_id
    };
    
    // Sign token with secret
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return token;
  }
};

module.exports = User; 