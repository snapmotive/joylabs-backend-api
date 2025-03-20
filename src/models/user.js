const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Mock in-memory database for testing/development
const mockUsers = {};

// Get DynamoDB client - use local version if in offline mode
let docClient;
if (process.env.IS_OFFLINE === 'true') {
  docClient = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  });
} else {
  docClient = new AWS.DynamoDB.DocumentClient();
}

// Table name from environment
const USERS_TABLE = process.env.USERS_TABLE || 'joylabs-users-dev';

class User {
  /**
   * Create a new user
   */
  static async create(userData) {
    const userId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const item = {
      id: userId,
      ...userData,
      created_at: timestamp,
      updated_at: timestamp
    };

    try {
      // Try to store in DynamoDB
      await docClient.put({
        TableName: USERS_TABLE,
        Item: item
      }).promise();
      
      return item;
    } catch (error) {
      console.warn('DynamoDB save failed, using mock storage:', error.message);
      
      // For development or testing, use mock storage
      if (process.env.NODE_ENV !== 'production') {
        mockUsers[userId] = item;
        return item;
      }
      
      throw error;
    }
  }

  /**
   * Find a user by ID
   */
  static async findById(userId) {
    try {
      // Try to get from DynamoDB
      const result = await docClient.get({
        TableName: USERS_TABLE,
        Key: { id: userId }
      }).promise();
      
      return result.Item;
    } catch (error) {
      console.warn('DynamoDB get failed, using mock storage:', error.message);
      
      // For development or testing, use mock storage
      if (process.env.NODE_ENV !== 'production') {
        return mockUsers[userId] || null;
      }
      
      throw error;
    }
  }

  /**
   * Find a user by email
   */
  static async findByEmail(email) {
    const params = {
      TableName: USERS_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    };

    try {
      const result = await docClient.query(params).promise();
      return result.Items[0];
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find a user by Square merchant ID
   */
  static async findBySquareMerchantId(merchantId) {
    try {
      // Try to query DynamoDB
      const result = await docClient.scan({
        TableName: USERS_TABLE,
        FilterExpression: 'square_merchant_id = :merchantId',
        ExpressionAttributeValues: {
          ':merchantId': merchantId
        }
      }).promise();
      
      return result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      console.warn('DynamoDB query failed, using mock storage:', error.message);
      
      // For development or testing, use mock storage
      if (process.env.NODE_ENV !== 'production') {
        return Object.values(mockUsers).find(user => user.square_merchant_id === merchantId) || null;
      }
      
      throw error;
    }
  }

  /**
   * Update a user
   */
  static async update(userId, updates) {
    const timestamp = new Date().toISOString();
    
    try {
      // Get current user data
      const user = await this.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Update the user
      const updatedUser = {
        ...user,
        ...updates,
        updated_at: timestamp
      };
      
      // Save to DynamoDB
      await docClient.put({
        TableName: USERS_TABLE,
        Item: updatedUser
      }).promise();
      
      return updatedUser;
    } catch (error) {
      console.warn('DynamoDB update failed, using mock storage:', error.message);
      
      // For development or testing, use mock storage
      if (process.env.NODE_ENV !== 'production') {
        if (!mockUsers[userId]) {
          throw new Error('User not found');
        }
        
        mockUsers[userId] = {
          ...mockUsers[userId],
          ...updates,
          updated_at: timestamp
        };
        
        return mockUsers[userId];
      }
      
      throw error;
    }
  }

  /**
   * Delete a user
   */
  static async delete(id) {
    const params = {
      TableName: USERS_TABLE,
      Key: { id }
    };

    try {
      await docClient.delete(params).promise();
      return { id };
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Generate a JWT token for a user
   */
  static generateToken(user) {
    // For development or testing, use a fixed secret
    const secret = process.env.JWT_SECRET || 'joylabs-dev-secret-key';
    
    // Create token payload
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      square_merchant_id: user.square_merchant_id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    // Sign the token
    return jwt.sign(payload, secret);
  }

  /**
   * Verify a JWT token
   */
  static verifyToken(token) {
    // For development or testing, use a fixed secret
    const secret = process.env.JWT_SECRET || 'joylabs-dev-secret-key';
    
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return null;
    }
  }
}

module.exports = User; 