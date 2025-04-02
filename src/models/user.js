const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Configure AWS DynamoDB client
const client = new DynamoDBClient({
  maxAttempts: 3,
  requestTimeout: 3000,
  region: process.env.AWS_REGION,
});

const dynamoDb = DynamoDBDocumentClient.from(client);
const usersTable = process.env.USERS_TABLE;

/**
 * User Service for DynamoDB
 */
const UserService = {
  /**
   * Get user by id
   * @param {string} id - User ID
   */
  async getById(id) {
    const params = {
      TableName: usersTable,
      Key: { id },
    };

    const result = await dynamoDb.send(new GetCommand(params));
    return result.Item;
  },

  /**
   * Create a new user
   * @param {Object} user - User data
   */
  async create(user) {
    const timestamp = new Date().toISOString();
    const newUser = {
      ...user,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const params = {
      TableName: usersTable,
      Item: newUser,
    };

    await dynamoDb.send(new PutCommand(params));
    return newUser;
  },

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} updates - Fields to update
   */
  async update(id, updates) {
    const timestamp = new Date().toISOString();

    // Build update expression and attribute values
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = {
      ':updatedAt': timestamp,
    };

    // Add each update field to the expression
    Object.keys(updates).forEach((key, index) => {
      if (key !== 'id') {
        // Don't update the primary key
        const attributeName = `:attr${index}`;
        updateExpression += `, ${key} = ${attributeName}`;
        expressionAttributeValues[attributeName] = updates[key];
      }
    });

    const params = {
      TableName: usersTable,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamoDb.send(new UpdateCommand(params));
    return result.Attributes;
  },

  /**
   * Delete a user
   * @param {string} id - User ID
   */
  async delete(id) {
    const params = {
      TableName: usersTable,
      Key: { id },
    };

    return dynamoDb.send(new DeleteCommand(params));
  },
};

module.exports = UserService;
