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
    if (process.env.IS_OFFLINE || process.env.NODE_ENV === 'development') {
      console.log('Using local environment variables for Square credentials');
      
      squareCredentials = {
        applicationId: process.env.SQUARE_APPLICATION_ID,
        applicationSecret: process.env.SQUARE_APPLICATION_SECRET,
        environment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
      };
      
      console.log('Loaded credentials:', {
        environment: squareCredentials.environment,
        applicationId: squareCredentials.applicationId
      });
      
      return squareCredentials;
    }
    
    // Otherwise fetch from Secrets Manager
    const secretId = process.env.SQUARE_CREDENTIALS_SECRET;
    if (!secretId) {
      throw new Error('SQUARE_CREDENTIALS_SECRET environment variable is not set');
    }

    console.log('Fetching Square credentials from Secrets Manager with secret ID:', secretId);
    const data = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
    
    if (!data.SecretString) {
      throw new Error('No SecretString found in AWS Secrets Manager response');
    }

    let secretData;
    try {
      secretData = JSON.parse(data.SecretString);
      console.log('Successfully parsed secret data with keys:', Object.keys(secretData));
    } catch (parseError) {
      console.error('Failed to parse secret data:', parseError);
      throw new Error('Failed to parse secret data from AWS Secrets Manager');
    }
    
    // Log the structure of the secret (without exposing values)
    console.log('Secret data structure:', {
      hasApplicationId: !!secretData.applicationId || !!secretData.SQUARE_APPLICATION_ID,
      hasApplicationSecret: !!secretData.applicationSecret || !!secretData.SQUARE_APPLICATION_SECRET,
      availableKeys: Object.keys(secretData)
    });
    
    // Try different possible key names
    const applicationId = secretData.applicationId || secretData.SQUARE_APPLICATION_ID;
    const applicationSecret = secretData.applicationSecret || secretData.SQUARE_APPLICATION_SECRET;
    
    if (!applicationId || !applicationSecret) {
      throw new Error(`Invalid secret format: missing required fields. Available keys: ${Object.keys(secretData).join(', ')}`);
    }

    squareCredentials = {
      applicationId,
      applicationSecret,
      environment: process.env.SQUARE_ENVIRONMENT || 'production'
    };
    
    console.log('Successfully loaded credentials from Secrets Manager with application ID:', squareCredentials.applicationId);
    
    // Validate the credentials format
    if (squareCredentials.applicationId.startsWith('sq0idp-') && 
        squareCredentials.applicationSecret.length > 0) {
      return squareCredentials;
    } else {
      throw new Error('Invalid credential format. Application ID should start with sq0idp-');
    }
  } catch (error) {
    console.error('Error fetching Square credentials:', error);
    throw error;
  }
};

/**
 * Get a configured Square API client
 */
const getSquareClient = (accessToken = null) => {
  const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
  const client = new Client({
    accessToken: accessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: environment,
    userAgentDetail: 'JoyLabs Backend API'
  });
  
  console.log('Created Square client with environment:', environment);
  return client;
};

/**
 * Generate a secure random state parameter for OAuth
 */
const generateStateParam = () => {
  // Generate a cryptographically secure random string
  const state = crypto.randomBytes(32).toString('hex');
  console.log('Generated OAuth state parameter:', state);
  return state;
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
  // In production, always use the API Gateway URL
  if (process.env.SQUARE_ENVIRONMENT === 'production') {
    return `https://012dp4dzhb.execute-api.us-west-1.amazonaws.com/dev/api/auth/square/callback`;
  }
  // For other environments, use the configured redirect URL
  return process.env.SQUARE_REDIRECT_URL;
};

/**
 * Generate OAuth URL for Square authorization
 */
const generateOAuthUrl = async (state) => {
  const credentials = await getSquareCredentials();
  const applicationId = credentials.applicationId;
  
  if (!applicationId) {
    throw new Error('Square application ID not configured');
  }

  console.log('Generating OAuth URL with state:', state);
  console.log('Using application ID:', applicationId);
  console.log('Environment:', process.env.SQUARE_ENVIRONMENT);
  
  const redirectUrl = getRedirectUrl();
  console.log('Redirect URL:', redirectUrl);
  
  // Validate redirect URL
  try {
    new URL(redirectUrl);
  } catch (error) {
    throw new Error('Invalid redirect URL: ' + redirectUrl);
  }
  
  const params = new URLSearchParams({
    client_id: applicationId,
    response_type: 'code',
    scope: 'MERCHANT_PROFILE_READ',
    redirect_uri: redirectUrl,
    state: state
  });

  // Always use production URL since we're in production mode
  const baseUrl = 'https://connect.squareup.com/oauth2/authorize';
  const url = `${baseUrl}?${params.toString()}`;
  
  console.log('Generated full OAuth URL:', url);
  return url;
};

/**
 * Exchange authorization code for OAuth token
 */
const exchangeCodeForToken = async (code) => {
  console.log('Exchanging authorization code for token');
  console.log('Using Square Environment:', process.env.SQUARE_ENVIRONMENT);
  
  // For test codes in development, return mock response
  if (code === 'test_authorization_code' && process.env.NODE_ENV !== 'production') {
    console.log('Using test authorization code with mock response');
    return {
      access_token: 'TEST_ACCESS_TOKEN_123',
      refresh_token: 'TEST_REFRESH_TOKEN_123',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      merchant_id: 'TEST_MERCHANT_123'
    };
  }
  
  const credentials = await getSquareCredentials();
  
  // Validate credentials format
  if (!credentials.applicationId?.startsWith('sq0idp-')) {
    throw new Error('Invalid application ID format');
  }
  
  if (!credentials.applicationSecret || credentials.applicationSecret === 'PLACEHOLDER') {
    throw new Error('Invalid application secret');
  }
  
  console.log('Got valid credentials with application ID:', credentials.applicationId);
  
  const baseUrl = 'https://connect.squareup.com';
  const redirectUrl = getRedirectUrl();
  
  try {
    console.log('Making token exchange request to Square');
    console.log('Using redirect URI:', redirectUrl);
    
    const requestBody = {
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
      code: code,
      redirect_uri: redirectUrl,
      grant_type: 'authorization_code'
    };
    
    // Validate request body
    if (Object.values(requestBody).some(value => !value)) {
      const missingFields = Object.entries(requestBody)
        .filter(([_, value]) => !value)
        .map(([key]) => key);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Log request (excluding secret)
    console.log('Request body:', {
      ...requestBody,
      client_secret: '[REDACTED]'
    });
    
    const response = await axios.post(`${baseUrl}/oauth2/token`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2023-12-13'
      }
    });
    
    if (!response.data?.access_token) {
      throw new Error('Invalid response from Square: missing access_token');
    }
    
    console.log('Successfully exchanged code for token');
    
    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: response.data.expires_at,
      merchant_id: response.data.merchant_id
    };
  } catch (error) {
    if (error.response?.data) {
      console.error('Square API Error:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    } else {
      console.error('Error exchanging code for token:', error);
    }
    throw error;
  }
};

/**
 * Refresh Square OAuth token
 */
async function refreshToken(refreshToken) {
  const credentials = await getSquareCredentials();
  
  const baseUrl = credentials.environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  
  try {
    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
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
  
  const baseUrl = credentials.environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  try {
    await axios.post(`${baseUrl}/oauth2/revoke`, {
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
      access_token: accessToken
    });
    
    return true;
  } catch (error) {
    console.error('Error revoking token:', error.response?.data || error.message);
    throw new Error('Failed to revoke token');
  }
}

/**
 * Test Square connection and get merchant information
 */
const testSquareConnection = async (accessToken) => {
  console.log('Testing Square connection');
  try {
    const response = await fetch('https://connect.squareup.com/v2/merchants/me', {
      method: 'GET',
      headers: {
        'Square-Version': '2023-12-13',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('Connection successful!');
      console.log('Merchant info:', {
        id: data.merchant.id,
        business_name: data.merchant.business_name,
        country: data.merchant.country,
        language_code: data.merchant.language_code
      });
      return {
        success: true,
        merchant: data.merchant
      };
    } else {
      console.error('Connection failed:', data.errors);
      return {
        success: false,
        error: data.errors
      };
    }
  } catch (error) {
    console.error('Connection test error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get merchant information from Square
 */
const getMerchantInfo = async (accessToken) => {
  console.log('Getting merchant information from Square');
  
  const result = await testSquareConnection(accessToken);
  if (!result.success) {
    throw new Error('Failed to get merchant information');
  }
  
  return result.merchant;
};

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
  createMockMerchantInfo,
  testSquareConnection
};