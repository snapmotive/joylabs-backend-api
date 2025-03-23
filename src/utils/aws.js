/**
 * AWS Service utilities with connection reuse
 */
const AWS = require('aws-sdk');

// Cached clients for connection reuse
let secretsManagerClient = null;
let s3Client = null;
let ssmClient = null;

/**
 * Get AWS Secrets Manager client with connection reuse
 * @returns {AWS.SecretsManager} AWS Secrets Manager client
 */
const getSecretsManager = () => {
  if (!secretsManagerClient) {
    secretsManagerClient = new AWS.SecretsManager({
      maxRetries: 3,
      httpOptions: {
        connectTimeout: 1000,
        timeout: 3000
      }
    });
  }
  return secretsManagerClient;
};

/**
 * Get a secret from AWS Secrets Manager
 * @param {string} secretName - The name of the secret to retrieve
 * @returns {Promise<string>} - The secret value
 */
const getSecret = async (secretName) => {
  try {
    // When running locally, mock the secret for testing
    if (process.env.IS_OFFLINE || process.env.NODE_ENV === 'development') {
      console.log('Running locally, returning mock secret');
      return JSON.stringify({
        applicationId: process.env.SQUARE_APPLICATION_ID || 'mock_app_id',
        applicationSecret: process.env.SQUARE_APPLICATION_SECRET || 'mock_app_secret',
        webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || 'mock_webhook_key'
      });
    }
    
    // Using AWS Secrets Manager
    const secretsManager = getSecretsManager();
    const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    
    if (!data.SecretString) {
      throw new Error('No SecretString found in AWS Secrets Manager response');
    }
    
    return data.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
};

/**
 * Get AWS S3 client with connection reuse
 * @returns {AWS.S3} AWS S3 client
 */
const getS3 = () => {
  if (!s3Client) {
    s3Client = new AWS.S3();
  }
  return s3Client;
};

/**
 * Get AWS SSM client with connection reuse
 * @returns {AWS.SSM} AWS SSM client
 */
const getSSM = () => {
  if (!ssmClient) {
    ssmClient = new AWS.SSM();
  }
  return ssmClient;
};

module.exports = {
  getSecretsManager,
  getSecret,
  getS3,
  getSSM
}; 