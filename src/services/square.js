require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const { Client, Environment } = require('square');

// AWS Secrets Manager client
const secretsManager = new AWS.SecretsManager();

// Cache for Square credentials
let squareCredentials = null;

/**
 * Get Square credentials from AWS Secrets Manager or environment variables
 */
const getSquareCredentials = async () => {
  // Clear cache for development
  if (process.env.IS_OFFLINE || process.env.NODE_ENV === 'development') {
    squareCredentials = null;
  }
  
  // Return cached credentials if available
  if (squareCredentials) {
    return squareCredentials;
  }
  
  try {
    // If running locally or environment variables are set, use them
    if (process.env.IS_OFFLINE || process.env.SQUARE_APPLICATION_ID) {
      console.log('Using local environment variables for Square credentials');
      console.log(`Application ID: ${process.env.SQUARE_APPLICATION_ID}`);
      console.log(`Environment: ${process.env.SQUARE_ENVIRONMENT}`);
      
      squareCredentials = {
        SQUARE_APPLICATION_ID: process.env.SQUARE_APPLICATION_ID,
        SQUARE_APPLICATION_SECRET: process.env.SQUARE_APPLICATION_SECRET,
        SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT || 'sandbox'
      };
      
      console.log('Loaded credentials:', {
        environment: squareCredentials.SQUARE_ENVIRONMENT,
        applicationId: squareCredentials.SQUARE_APPLICATION_ID
      });
      
      return squareCredentials;
    }
    
    // Otherwise fetch from Secrets Manager
    const secretId = process.env.SQUARE_SECRETS_ARN;
    const data = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
    
    if ('SecretString' in data) {
      squareCredentials = JSON.parse(data.SecretString);
      return squareCredentials;
    } else {
      throw new Error('Secret value is binary - not supported');
    }
  } catch (error) {
    console.error('Error fetching Square credentials:', error);
    throw error;
  }
};

/**
 * Get a configured Square API client
 */
function getSquareClient(accessToken = null) {
  console.log('Creating Square client with environment:', process.env.SQUARE_ENVIRONMENT);
  
  // Always use production unless explicitly set to sandbox
  const environment = process.env.SQUARE_ENVIRONMENT !== 'sandbox' 
    ? Environment.Production 
    : Environment.Sandbox;
  
  console.log('Using Square environment:', environment);
  
  // Create client configuration
  const clientConfig = {
    environment,
    userAgentDetail: 'JoyLabs API Server'
  };
  
  // If access token is provided, use it for this client
  if (accessToken) {
    console.log('Using provided access token for Square client');
    clientConfig.accessToken = accessToken;
  }
  
  // Create the Square client
  const client = new Client(clientConfig);
  
  // Log client configuration (excluding sensitive data)
  console.log('Square client configuration:', {
    environment: clientConfig.environment,
    userAgentDetail: clientConfig.userAgentDetail,
    hasAccessToken: !!clientConfig.accessToken
  });
  
  return client;
}

/**
 * Generate a secure random state parameter for OAuth
 */
const generateStateParam = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Generate a code verifier for PKCE
 */
const generateCodeVerifier = () => {
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Create code challenge from verifier for PKCE
 */
const generateCodeChallenge = (verifier) => {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
};

/**
 * Generate a random string for state parameter or code verifier
 */
function generateRandomString(length = 32) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const getRedirectUrl = () => {
  // For local development or sandbox mode
  if (process.env.IS_OFFLINE || process.env.NODE_ENV === 'development' || process.env.SQUARE_ENVIRONMENT === 'sandbox') {
    return 'http://localhost:3001/api/auth/square/callback';
  }
  
  // For production - always use AWS URL
  return 'https://012dp4dzhb.execute-api.us-west-1.amazonaws.com/dev/api/auth/square/callback';
};

/**
 * Generate OAuth URL for Square authorization
 */
const generateOAuthUrl = async (state) => {
  const credentials = await getSquareCredentials();
  const applicationId = credentials.applicationId || process.env.SQUARE_APPLICATION_ID;
  
  if (!applicationId) {
    throw new Error('Square application ID not configured');
  }

  // Log the application ID being used
  console.log('Using application ID:', applicationId);
  console.log('Environment:', process.env.SQUARE_ENVIRONMENT);
  
  const params = new URLSearchParams({
    client_id: applicationId,
    response_type: 'code',
    scope: 'MERCHANT_PROFILE_READ',
    redirect_uri: getRedirectUrl(),
    state: state
  });

  // Use connect.squareup.com for production, squareup.com for sandbox
  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production' 
    ? 'https://connect.squareup.com/oauth2/authorize'
    : 'https://connect.squareup.com/oauth2/authorize';

  const url = `${baseUrl}?${params.toString()}`;
  console.log('Generated OAuth URL:', url);
  
  return url;
};

/**
 * Exchange authorization code for OAuth token
 */
async function exchangeCodeForToken(code, code_verifier = null) {
  console.log('Exchanging authorization code for token');
  console.log(`Using Square Environment: ${process.env.SQUARE_ENVIRONMENT}`);
  
  // Special handling for test code - create mock token regardless of environment
  if (code === 'test_authorization_code') {
    console.log('Using test authorization code with mock response');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Add 30 days
    
    return {
      merchant_id: 'TEST_MERCHANT_123',
      access_token: 'TEST_ACCESS_TOKEN_123',
      refresh_token: 'TEST_REFRESH_TOKEN_123',
      expires_at: expiresAt.toISOString() // 30 days from now
    };
  }
  
  try {
    console.log('Creating OAuth instance');
    console.log(`Application ID: ${process.env.SQUARE_APPLICATION_ID}`);
    console.log(`Application Secret: ${process.env.SQUARE_APPLICATION_SECRET ? '******' : 'NOT SET'}`);
    console.log(`Environment: ${process.env.SQUARE_ENVIRONMENT}`);
    console.log(`Redirect URL: ${getRedirectUrl()}`);
    
    // Get Square client
    const client = getSquareClient();
    
    // Construct the token request
    const tokenRequest = {
      clientId: process.env.SQUARE_APPLICATION_ID,
      clientSecret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grantType: 'authorization_code',
      redirectUri: getRedirectUrl()
    };
    
    // Add code verifier for PKCE if available
    if (code_verifier) {
      console.log('Using PKCE code verifier');
      tokenRequest.codeVerifier = code_verifier;
    }
    
    // Log request details (excluding sensitive info)
    const logSafeRequest = { ...tokenRequest };
    delete logSafeRequest.clientSecret;
    console.log('Token Exchange Request:', JSON.stringify(logSafeRequest, null, 2));
    
    // Make the token request
    const response = await client.oAuthApi.obtainToken(tokenRequest);
    
    if (response.statusCode !== 200) {
      console.error('Error obtaining token:', response.body);
      throw new Error(`Failed to exchange authorization code: ${response.body?.errors?.[0]?.detail || 'Unknown error'}`);
    }
    
    console.log('Access token obtained successfully');
    const data = response.result;
    
    // Calculate expires_at from expires_in
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + data.expiresIn);
    
    return {
      merchant_id: data.merchantId,
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
      expires_at: expiresAt.toISOString()
    };
    
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    
    // Extract detailed error information
    const statusCode = error.statusCode || 500;
    const errorDetails = error.errors || [];
    
    const errorMessage = `Failed to exchange code for token: ${errorDetails[0]?.detail || error.message}`;
    console.error('API Error details:', JSON.stringify(errorDetails, null, 2));
    
    // Rethrow with better formatting
    const formattedError = new Error(errorMessage);
    formattedError.originalError = error;
    formattedError.statusCode = statusCode;
    formattedError.squareDetails = errorDetails;
    
    throw formattedError;
  }
}

/**
 * Refresh Square OAuth token
 */
async function refreshToken(refreshToken) {
  const credentials = await getSquareCredentials();
  
  const baseUrl = credentials.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  
  try {
    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: credentials.SQUARE_APPLICATION_ID,
      client_secret: credentials.SQUARE_APPLICATION_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    
    // Add timestamp for token refresh for monitoring
    const result = {
      ...response.data,
      refreshed_at: new Date().toISOString()
    };
    
    // Log successful token refresh
    console.info(`Square token refreshed successfully at ${result.refreshed_at}`);
    
    return result;
  } catch (error) {
    // Enhanced error handling with detailed logging
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    console.error('Error refreshing token:', {
      statusCode,
      errorType: errorData?.type,
      errorDetail: errorData?.errors,
      message: error.message
    });
    
    // Throw specific error based on status code for better client handling
    if (statusCode === 401 || statusCode === 403) {
      throw new Error('Refresh token is invalid or expired. User must re-authenticate.');
    } else if (statusCode === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else {
      throw new Error('Failed to refresh token');
    }
  }
}

/**
 * Revoke Square access token
 */
async function revokeToken(accessToken) {
  const credentials = await getSquareCredentials();
  
  const baseUrl = credentials.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  try {
    await axios.post(`${baseUrl}/oauth2/revoke`, {
      client_id: credentials.SQUARE_APPLICATION_ID,
      client_secret: credentials.SQUARE_APPLICATION_SECRET,
      access_token: accessToken
    });
    
    return true;
  } catch (error) {
    console.error('Error revoking token:', error.response?.data || error.message);
    throw new Error('Failed to revoke token');
  }
}

/**
 * Get merchant information using the access token
 */
async function getMerchantInfo(accessToken) {
  console.log('Getting merchant information from Square');
  
  // If this is a test token, return mock data
  if (accessToken.startsWith('TEST_')) {
    console.log('Using mock merchant info for test token');
    return {
      id: 'TEST_MERCHANT_123',
      name: 'Test Square Merchant',
      email: 'test@example.com',
      country: 'US',
      language: 'en-US'
    };
  }
  
  try {
    // Create client instance with the provided token
    const client = getSquareClient();
    client.customersApi.configuration.accessToken = accessToken;
    
    // Get merchant info from locations API
    const response = await client.locationsApi.listLocations();
    
    if (response.statusCode !== 200) {
      console.error('Error getting merchant info:', response.body);
      throw new Error('Failed to get merchant information');
    }
    
    const mainLocation = response.result.locations[0];
    
    return {
      id: mainLocation.merchantId || 'unknown',
      name: mainLocation.businessName || mainLocation.name || 'Unknown Business',
      email: mainLocation.businessEmail || null,
      country: mainLocation.country || 'US',
      language: mainLocation.languageCode || 'en-US'
    };
  } catch (error) {
    console.error('Error getting merchant info:', error);
    throw error;
  }
}

/**
 * Create a mock token response for testing
 */
function createMockTokenResponse() {
  // Generate a test access token with a random merchant ID
  const merchantId = `TEST_${crypto.randomBytes(8).toString('hex')}`;
  const accessToken = `TEST_${merchantId}`;
  
  // Current time plus 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAt,
    merchant_id: merchantId,
    refresh_token: `TEST_REFRESH_${crypto.randomBytes(8).toString('hex')}`,
    scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE',
    expires_in: 30 * 24 * 60 * 60 // 30 days in seconds
  };
}

/**
 * Create mock merchant information for testing
 */
function createMockMerchantInfo(merchantId = null) {
  // Create a merchant ID if not provided
  if (!merchantId) {
    merchantId = `TEST_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  return {
    merchantId: merchantId,
    businessName: 'Test Business Name',
    country: 'US',
    language: 'en-US',
    currency: 'USD',
    status: 'ACTIVE',
    mainLocationId: `TEST_LOC_${crypto.randomBytes(4).toString('hex')}`
  };
}

// Export functions
module.exports = {
  generateOAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  revokeToken,
  getMerchantInfo,
  getSquareClient,
  generateStateParam,
  generateCodeVerifier,
  generateCodeChallenge,
  generateRandomString,
  createMockTokenResponse,
  createMockMerchantInfo
};