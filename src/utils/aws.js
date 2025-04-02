/**
 * AWS Service utilities with connection reuse
 */
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// Cached clients for connection reuse
let secretsManagerClient = null;
let dynamoDbClient = null;

/**
 * Get AWS Secrets Manager client with connection reuse
 * @returns {SecretsManagerClient} AWS Secrets Manager client
 */
const getSecretsManager = () => {
  if (!secretsManagerClient) {
    secretsManagerClient = new SecretsManagerClient({
      maxAttempts: 3,
      requestTimeout: 3000,
    });
  }
  return secretsManagerClient;
};

/**
 * Get a secret from AWS Secrets Manager
 * @param {string} secretName - The name of the secret to retrieve
 * @returns {Promise<string>} - The secret value
 */
const getSecret = async secretName => {
  try {
    const secretsManager = getSecretsManager();
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManager.send(command);

    if (!response.SecretString) {
      throw new Error('No SecretString found in AWS Secrets Manager response');
    }

    return response.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
};

/**
 * Get DynamoDB Document Client with connection reuse
 * @returns {DynamoDBDocumentClient} DynamoDB Document Client
 */
const getDynamoDb = () => {
  if (!dynamoDbClient) {
    const client = new DynamoDBClient({
      maxAttempts: 3,
      requestTimeout: 3000,
    });
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDbClient;
};

module.exports = {
  getSecretsManager,
  getSecret,
  getDynamoDb,
};
