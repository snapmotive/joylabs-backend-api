const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
const dynamoDb = process.env.IS_OFFLINE === 'true'
  ? new AWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  : new AWS.DynamoDB.DocumentClient();

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
      TableName: categoriesTable
    };

    const result = await dynamoDb.scan(params).promise();
    return result.Items;
  },

  /**
   * Get category by id
   * @param {string} id - Category ID
   */
  async getById(id) {
    const params = {
      TableName: categoriesTable,
      Key: { id }
    };

    const result = await dynamoDb.get(params).promise();
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
        '#name': 'name' // 'name' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: {
        ':name': name
      }
    };

    const result = await dynamoDb.query(params).promise();
    return result.Items[0];
  },

  /**
   * Create a new category
   * @param {Object} category - Category data
   */
  async create(category) {
    // Check if category with the same name already exists
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
      updatedAt: timestamp
    };

    const params = {
      TableName: categoriesTable,
      Item: newCategory
    };

    await dynamoDb.put(params).promise();
    return newCategory;
  },

  /**
   * Update a category
   * @param {string} id - Category ID
   * @param {Object} updates - Fields to update
   */
  async update(id, updates) {
    const timestamp = new Date().toISOString();
    
    // Build update expression and attribute values
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = {
      ':updatedAt': timestamp
    };

    // Add each update field to the expression
    Object.keys(updates).forEach((key, index) => {
      if (key !== 'id') { // Don't update the primary key
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
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamoDb.update(params).promise();
    return result.Attributes;
  },

  /**
   * Delete a category
   * @param {string} id - Category ID
   */
  async delete(id) {
    const params = {
      TableName: categoriesTable,
      Key: { id }
    };

    return dynamoDb.delete(params).promise();
  }
};

module.exports = CategoryService; 