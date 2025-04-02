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
  region: process.env.AWS_REGION,
});

const dynamoDb = DynamoDBDocumentClient.from(client);
const productsTable = process.env.PRODUCTS_TABLE;

/**
 * Product Service for DynamoDB
 */
const ProductService = {
  /**
   * Get all products
   */
  async getAll() {
    const params = {
      TableName: productsTable,
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    return result.Items;
  },

  /**
   * Get product by id
   * @param {string} id - Product ID
   */
  async getById(id) {
    const params = {
      TableName: productsTable,
      Key: { id },
    };

    const result = await dynamoDb.send(new GetCommand(params));
    return result.Item;
  },

  /**
   * Get product by SKU
   * @param {string} sku - Product SKU
   */
  async getBySku(sku) {
    const params = {
      TableName: productsTable,
      IndexName: 'SkuIndex',
      KeyConditionExpression: 'sku = :sku',
      ExpressionAttributeValues: { ':sku': sku },
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    return result.Items[0];
  },

  /**
   * Get product by barcode
   * @param {string} barcode - Product barcode
   */
  async getByBarcode(barcode) {
    const params = {
      TableName: productsTable,
      IndexName: 'BarcodeIndex',
      KeyConditionExpression: 'barcode = :barcode',
      ExpressionAttributeValues: { ':barcode': barcode },
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    return result.Items[0];
  },

  /**
   * Create a new product
   * @param {Object} product - Product data
   */
  async create(product) {
    const timestamp = new Date().toISOString();
    const newProduct = {
      id: uuidv4(),
      ...product,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const params = {
      TableName: productsTable,
      Item: newProduct,
    };

    await dynamoDb.send(new PutCommand(params));
    return newProduct;
  },

  /**
   * Update a product
   * @param {string} id - Product ID
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
      TableName: productsTable,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamoDb.send(new UpdateCommand(params));
    return result.Attributes;
  },

  /**
   * Delete a product
   * @param {string} id - Product ID
   */
  async delete(id) {
    const params = {
      TableName: productsTable,
      Key: { id },
    };

    return dynamoDb.send(new DeleteCommand(params));
  },

  /**
   * Search products by name or description
   * @param {string} searchTerm - Search term
   */
  async search(searchTerm) {
    const params = {
      TableName: productsTable,
      FilterExpression: 'contains(#name, :searchTerm) OR contains(description, :searchTerm)',
      ExpressionAttributeNames: {
        '#name': 'name', // 'name' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: {
        ':searchTerm': searchTerm,
      },
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    return result.Items;
  },
};

module.exports = ProductService;
