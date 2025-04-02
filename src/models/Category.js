const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
const client = new DynamoDBClient({
  maxAttempts: 3,
  requestTimeout: 3000,
});

const dynamoDb = DynamoDBDocumentClient.from(client);
const categoriesTable = process.env.CATEGORIES_TABLE;

/**
 * Category Service for DynamoDB
 */
const CategoryService = {
  /**
   * Get all categories
   */
  async getAll() {
    const params = {
      TableName: categoriesTable,
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    return result.Items;
  },

  /**
   * Get category by id
   * @param {string} id - Category ID
   */
  async getById(id) {
    const params = {
      TableName: categoriesTable,
      Key: { id },
    };

    const result = await dynamoDb.send(new GetCommand(params));
    return result.Item;
  },

  /**
   * Get category by name
   * @param {string} name - Category name
   */
  async getByName(name) {
    const params = {
      TableName: categoriesTable,
      IndexName: 'NameIndex',
      KeyConditionExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name',
      },
      ExpressionAttributeValues: {
        ':name': name,
      },
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    return result.Items[0];
  },

  /**
   * Create a new category
   * @param {Object} category - Category data
   */
  async create(category) {
    const existingCategory = await this.getByName(category.name);
    if (existingCategory) {
      throw new Error('Category with this name already exists');
    }

    const timestamp = new Date().toISOString();
    const newCategory = {
      id: uuidv4(),
      ...category,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const params = {
      TableName: categoriesTable,
      Item: newCategory,
    };

    await dynamoDb.send(new PutCommand(params));
    return newCategory;
  },

  /**
   * Update a category
   * @param {string} id - Category ID
   * @param {Object} updates - Fields to update
   */
  async update(id, updates) {
    const timestamp = new Date().toISOString();

    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = {
      ':updatedAt': timestamp,
    };

    Object.keys(updates).forEach((key, index) => {
      if (key !== 'id') {
        const attributeName = `:attr${index}`;
        updateExpression += `, ${key} = ${attributeName}`;
        expressionAttributeValues[attributeName] = updates[key];
      }
    });

    const params = {
      TableName: categoriesTable,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamoDb.send(new UpdateCommand(params));
    return result.Attributes;
  },

  /**
   * Delete a category
   * @param {string} id - Category ID
   */
  async delete(id) {
    const params = {
      TableName: categoriesTable,
      Key: { id },
    };

    return dynamoDb.send(new DeleteCommand(params));
  },
};

module.exports = CategoryService;
