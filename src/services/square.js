const axios = require('axios');
const crypto = require('crypto');
const AWS = require('aws-sdk');

// AWS Secrets Manager client
const secretsManager = new AWS.SecretsManager();

// Cache for Square credentials
let squareCredentials = null;

/**
 * Get Square credentials from AWS Secrets Manager
 */
const getSquareCredentials = async () => {
  // Return cached credentials if available
  if (squareCredentials) {
    return squareCredentials;
  }
  
  try {
    // If running locally and credentials are in environment variables, use those
    if (process.env.IS_OFFLINE === 'true' && process.env.SQUARE_APPLICATION_ID) {
      squareCredentials = {
        SQUARE_APPLICATION_ID: process.env.SQUARE_APPLICATION_ID,
        SQUARE_APPLICATION_SECRET: process.env.SQUARE_APPLICATION_SECRET,
        SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT
      };
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
    
    // Fallback to environment variables
    squareCredentials = {
      SQUARE_APPLICATION_ID: process.env.SQUARE_APPLICATION_ID,
      SQUARE_APPLICATION_SECRET: process.env.SQUARE_APPLICATION_SECRET,
      SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT
    };
    return squareCredentials;
  }
};

/**
 * Initialize Square client
 */
const getSquareClient = async () => {
  const credentials = await getSquareCredentials();
  const environment = credentials.SQUARE_ENVIRONMENT || 'sandbox';
  
  // This is a stub - in a real implementation, you would return a proper Square client
  return {
    environment,
    applicationId: credentials.SQUARE_APPLICATION_ID
  };
};

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
 * Generate the OAuth authorization URL for Square with PKCE support
 */
const getAuthorizationUrl = async (state, codeChallenge = null) => {
  const credentials = await getSquareCredentials();
  
  const baseUrl = credentials.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  
  // Include all required permissions for catalog management
  const scopes = [
    'ITEMS_READ',
    'ITEMS_WRITE',
    'INVENTORY_READ',
    'INVENTORY_WRITE',
    'MERCHANT_PROFILE_READ',
    'ORDERS_READ',
    'ORDERS_WRITE',
    'CUSTOMERS_READ',
    'CUSTOMERS_WRITE'
  ].join(' ');
  
  // Use production URL if available, otherwise use API_BASE_URL
  const apiBaseUrl = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'dev'
    ? (process.env.API_PROD_URL || process.env.API_BASE_URL)
    : process.env.API_BASE_URL;
  
  const redirectUrl = `${apiBaseUrl}/api/auth/square/callback`;
  
  console.log('Redirect URL for OAuth:', redirectUrl);
  console.log('Using state parameter:', state);
  
  let url = `${baseUrl}/oauth2/authorize?client_id=${credentials.SQUARE_APPLICATION_ID}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}`;
  
  // Add PKCE parameters if code challenge is provided
  if (codeChallenge) {
    url += `&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    console.log('Using PKCE with code challenge');
  }
  
  return url;
};

/**
 * Exchange OAuth code for access token with PKCE support
 */
const exchangeCodeForToken = async (code, codeVerifier = null) => {
  const credentials = await getSquareCredentials();
  
  const baseUrl = credentials.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  
  // Use the correct API URL (production or localhost) based on environment
  const apiBaseUrl = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'dev'
    ? (process.env.API_PROD_URL || process.env.API_BASE_URL)
    : process.env.API_BASE_URL;
  
  const redirectUrl = `${apiBaseUrl}/api/auth/square/callback`;
  
  console.log('Exchange token redirect URL:', redirectUrl);
  
  try {
    const requestBody = {
      client_id: credentials.SQUARE_APPLICATION_ID,
      client_secret: credentials.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUrl
    };
    
    // Add code verifier if provided (for PKCE)
    if (codeVerifier) {
      requestBody.code_verifier = codeVerifier;
      console.log('Including code verifier for PKCE token exchange');
    }
    
    console.log('Exchanging code for token with Square...');
    const response = await axios.post(`${baseUrl}/oauth2/token`, requestBody);
    
    console.log('Token exchange successful');
    return response.data;
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status code:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers));
      console.error('Response data:', JSON.stringify(error.response.data));
    }
    throw new Error('Failed to exchange code for token');
  }
};

/**
 * Refresh Square OAuth token
 */
const refreshToken = async (refreshToken) => {
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
};

/**
 * Revoke Square access token
 */
const revokeToken = async (accessToken) => {
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
};

/**
 * Fetch merchant info using access token
 */
const getMerchantInfo = async (accessToken) => {
  if (!accessToken) {
    console.error('No access token provided to getMerchantInfo');
    throw new Error('Access token is required');
  }

  console.log('Getting merchant info with access token:', accessToken.substring(0, 10) + '...');
  
  try {
    // In production, we would use the Square SDK
    // But for development/testing, we'll make a direct API call
    const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production' 
      ? 'https://connect.squareup.com' 
      : 'https://connect.squareupsandbox.com';
    
    console.log('Using Square API URL:', baseUrl);
    
    // Make API call to get merchant info
    const response = await axios.get(`${baseUrl}/v2/merchants/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2023-09-25' // Use latest API version
      }
    });
    
    console.log('Merchant API response status:', response.status);
    console.log('Merchant API response data:', JSON.stringify(response.data, null, 2));
    
    // Extract merchant data from response
    if (response.data && response.data.merchant) {
      return response.data.merchant;
    } else {
      console.error('Unexpected response format:', response.data);
      
      // Create a dummy merchant for development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Creating mock merchant data for development');
        return {
          id: 'DEV_' + Math.random().toString(36).substring(2, 10),
          business_name: 'Development Test Merchant',
          country: 'US',
          language_code: 'en-US',
          currency: 'USD',
          status: 'ACTIVE',
          main_location_id: 'mock-location'
        };
      } else {
        throw new Error('Invalid merchant data received from Square API');
      }
    }
  } catch (error) {
    console.error('Error fetching merchant info:', error.message);
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    // In development mode, provide a mock merchant
    if (process.env.NODE_ENV !== 'production') {
      console.log('Creating mock merchant data after error in development');
      return {
        id: 'DEV_' + Math.random().toString(36).substring(2, 10),
        business_name: 'Development Test Merchant',
        country: 'US',
        language_code: 'en-US',
        currency: 'USD',
        status: 'ACTIVE',
        main_location_id: 'mock-location'
      };
    }
    
    throw new Error(`Failed to fetch merchant info: ${error.message}`);
  }
};

// Export all required methods for production use
module.exports = {
  getSquareClient,
  generateStateParam,
  generateCodeVerifier,
  generateCodeChallenge,
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshToken,
  revokeToken,
  getMerchantInfo
}; 