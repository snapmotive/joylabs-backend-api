const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Initialize DynamoDB client
const dynamoDb = process.env.IS_OFFLINE === 'true'
  ? new AWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  : new AWS.DynamoDB.DocumentClient();

const USERS_TABLE = process.env.USERS_TABLE;

class User {
  /**
   * Create a new user
   */
  static async create(userData) {
    const timestamp = new Date().toISOString();
    const id = uuidv4();

    const params = {
      TableName: USERS_TABLE,
      Item: {
        id,
        email: userData.email,
        name: userData.name,
        square_merchant_id: userData.square_merchant_id || null,
        square_access_token: userData.square_access_token || null,
        square_refresh_token: userData.square_refresh_token || null,
        square_token_expires_at: userData.square_token_expires_at || null,
        created_at: timestamp,
        updated_at: timestamp
      }
    };

    try {
      await dynamoDb.put(params).promise();
      return params.Item;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Find a user by ID
   */
  static async findById(id) {
    const params = {
      TableName: USERS_TABLE,
      Key: { id }
    };

    try {
      const result = await dynamoDb.get(params).promise();
      return result.Item;
    } catch (error) {
      console.error('Error finding user by ID:', error);
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
      const result = await dynamoDb.query(params).promise();
      return result.Items[0];
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find a user by Square merchant ID
   */
  static async findBySquareMerchantId(square_merchant_id) {
    const params = {
      TableName: USERS_TABLE,
      IndexName: 'SquareMerchantIndex',
      KeyConditionExpression: 'square_merchant_id = :square_merchant_id',
      ExpressionAttributeValues: {
        ':square_merchant_id': square_merchant_id
      }
    };

    try {
      const result = await dynamoDb.query(params).promise();
      return result.Items[0];
    } catch (error) {
      console.error('Error finding user by Square merchant ID:', error);
      throw error;
    }
  }

  /**
   * Update a user
   */
  static async update(id, updateData) {
    // Creating the update expressions
    const timestamp = new Date().toISOString();
    let updateExpression = 'set updated_at = :updated_at';
    let expressionAttributeValues = {
      ':updated_at': timestamp
    };

    // Add fields that are being updated
    Object.keys(updateData).forEach(key => {
      if (key !== 'id') { // Skip the id
        updateExpression += `, ${key} = :${key}`;
        expressionAttributeValues[`:${key}`] = updateData[key];
      }
    });

    const params = {
      TableName: USERS_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await dynamoDb.update(params).promise();
      return result.Attributes;
    } catch (error) {
      console.error('Error updating user:', error);
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
      await dynamoDb.delete(params).promise();
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
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        square_merchant_id: user.square_merchant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }
}

module.exports = User; 