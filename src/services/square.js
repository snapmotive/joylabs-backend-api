require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const { Client, Environment } = require('square');
const awsUtils = require('../utils/aws');

// Cache for Square credentials and clients
let squareCredentials = null;
const squareClientCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const CREDENTIALS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for credentials

/**
 * Cache wrapper for frequently used functions
 */
function withCache(fn, cacheKey, ttl = CACHE_TTL) {
  const cache = new Map();
  
  return async (...args) => {
    const key = `${cacheKey}:${JSON.stringify(args)}`;
    const now = Date.now();
    
    if (cache.has(key)) {
      const { value, expires } = cache.get(key);
      if (now < expires) {
        console.log(`Cache hit for ${cacheKey}`);
        return value;
      }
      console.log(`Cache expired for ${cacheKey}`);
      cache.delete(key);
    }
    
    const result = await fn(...args);
    cache.set(key, {
      value: result,
      expires: now + ttl
    });
    
    return result;
  };
}

/**
 * Retrieve Square credentials
 * @returns {Promise<Object>} Square credentials
 */
async function getSquareCredentials() {
  try {
    // First check if credentials are in environment variables
    const envCredentials = {
      applicationId: process.env.SQUARE_APPLICATION_ID,
      applicationSecret: process.env.SQUARE_APPLICATION_SECRET,
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: 'production', // Always use production
      webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    };

    // If all credentials are available in environment variables, use them
    if (envCredentials.applicationId && 
        envCredentials.applicationSecret && 
        envCredentials.accessToken && 
        envCredentials.webhookSignatureKey) {
      console.log('Using Square credentials from environment variables');
      return envCredentials;
    }

    // Otherwise, retrieve from AWS Secrets Manager
    console.log('Retrieving Square credentials from AWS Secrets Manager');
    
    // Use AWS SDK to get secrets
    const secretName = process.env.SQUARE_CREDENTIALS_SECRET_NAME || 'dev/joylabs/square';
    
    try {
      const secretValue = await awsUtils.getSecret(secretName);
      const credentials = JSON.parse(secretValue);
      
      console.log('Square Environment: production');
      
      return {
        ...credentials,
        environment: 'production' // Always use production
      };
    } catch (error) {
      console.error('Error retrieving Square credentials from AWS Secrets Manager:', error);
      throw new Error('Failed to retrieve Square credentials');
    }
  } catch (error) {
    console.error('Error getting Square credentials:', error);
    throw error;
  }
}

/**
 * Get a configured Square API client with connection reuse
 */
const getSquareClient = (accessToken = null) => {
  const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
  
  // Use cache to avoid creating multiple clients with the same token
  const cacheKey = `${accessToken || 'default'}-${environment}`;
  
  if (squareClientCache.has(cacheKey)) {
    console.log('Reusing existing Square client from cache');
    return squareClientCache.get(cacheKey);
  }
  
  console.log('Creating new Square client with environment:', environment);
  const client = new Client({
    accessToken: accessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: environment,
    userAgentDetail: 'JoyLabs Backend API',
    timeout: 10000, // 10 second timeout for all requests
    numberOfRetries: 3, // Retry failed requests
  });
  
  // Cache the client for reuse
  squareClientCache.set(cacheKey, client);
  
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
const generateCodeChallenge = async (verifier) => {
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
  // Always use the production API Gateway URL
  return `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback`;
};

/**
 * Generate Square OAuth URL
 */
async function generateOAuthUrl(state, codeVerifier = null) {
  const credentials = await getSquareCredentials();
  console.log(`Generating OAuth URL with state: ${state}, app ID: ${credentials.applicationId}`);
  
  // Always use production URL
  const baseUrl = 'https://connect.squareup.com';
  
  // Ensure valid redirect URL
  const redirectUrl = process.env.SQUARE_REDIRECT_URL;
  if (!redirectUrl) {
    throw new Error('SQUARE_REDIRECT_URL is not configured');
  }
  
  // Construct the OAuth URL with all required parameters
  const params = new URLSearchParams({
    client_id: credentials.applicationId,
    response_type: 'code',
    scope: 'MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_READ ORDERS_READ ORDERS_WRITE ITEMS_READ ITEMS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE',
    redirect_uri: redirectUrl,
    state
  });
  
  // Add PKCE parameters if code verifier is provided
  if (codeVerifier) {
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', 'S256');
    console.log('Added PKCE parameters to OAuth URL');
  } else {
    console.log('No code verifier provided, not using PKCE flow');
  }
  
  return `${baseUrl}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for OAuth token
 */
const exchangeCodeForToken = async (code, code_verifier = null) => {
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
  
  // Always use production URL for Square API in production mode
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
    
    // Add code_verifier for PKCE if provided
    if (code_verifier) {
      console.log('Using PKCE flow with code_verifier');
      requestBody.code_verifier = code_verifier;
    }
    
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
      client_secret: '[REDACTED]',
      code_verifier: code_verifier ? '[REDACTED]' : undefined
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
  
  // Always use production URL
  const baseUrl = 'https://connect.squareup.com';
  
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
    
    console.log('Successfully refreshed token');
    
    return result;
  } catch (error) {
    console.error('Error refreshing token:', error.message);
    
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    
    throw error;
  }
}

/**
 * Revoke Square access token
 */
async function revokeToken(accessToken) {
  const credentials = await getSquareCredentials();
  
  // Always use production URL
  const baseUrl = 'https://connect.squareup.com';

  try {
    await axios.post(`${baseUrl}/oauth2/revoke`, {
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
      access_token: accessToken
    });
    
    return true;
  } catch (error) {
    console.error('Error revoking token:', error.response?.data || error.message);
    return false;
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
 * Wrap merchant info function with caching
 */
const getMerchantInfoWithCache = withCache(async (accessToken, merchantId = null) => {
  try {
    const client = getSquareClient(accessToken);
    const response = await client.merchantsApi.retrieveMerchant(merchantId || 'me');
    console.log('Successfully retrieved merchant info');
    return response.result.merchant;
  } catch (error) {
    console.error('Error getting merchant info:', error);
    throw error;
  }
}, 'merchantInfo', 30 * 60 * 1000); // 30 minute cache for merchant info

// Export cached version
const getMerchantInfo = getMerchantInfoWithCache;

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

// Add helper function for optimized token refresh with retries and backoff
async function refreshTokenWithRetry(refreshToken, maxRetries = 3) {
  let retries = 0;
  let lastError = null;
  
  while (retries < maxRetries) {
    try {
      console.log(`Attempting to refresh token (attempt ${retries + 1}/${maxRetries})`);
      return await refreshToken(refreshToken);
    } catch (error) {
      lastError = error;
      console.error(`Token refresh failed (attempt ${retries + 1}/${maxRetries}):`, error.message);
      
      // Check if error is retryable
      if (error.status && error.status >= 500) {
        // Server error, can retry
        retries++;
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.status === 429) {
        // Rate limited, wait longer
        retries++;
        const delay = Math.pow(2, retries) * 2000; // Longer exponential backoff
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Client error, don't retry
        throw error;
      }
    }
  }
  
  throw lastError;
}

// Add function to handle connection pooling for axios
const getAxiosInstance = () => {
  return axios.create({
    timeout: 10000,
    maxRedirects: 5,
    httpAgent: new require('http').Agent({ keepAlive: true }),
    httpsAgent: new require('https').Agent({ keepAlive: true })
  });
};

/**
 * Verify Square webhook signature
 * @param {string} signature - The Square-Signature header value
 * @param {string} body - The raw request body as a string
 * @returns {boolean} - Whether the signature is valid
 */
async function verifyWebhookSignature(signature, body) {
  try {
    if (!signature || !body) {
      console.warn('Missing signature or body for webhook verification');
      console.warn(`Signature: ${signature ? 'present' : 'missing'}, Body: ${body ? 'present' : 'missing'}`);
      return false;
    }

    // Get Square webhook signature key from credentials or env
    const credentials = await getSquareCredentials();
    const signatureKey = credentials.webhookSignatureKey;
    
    if (!signatureKey) {
      console.error('Webhook signature key is not configured');
      console.error('Please set the SQUARE_WEBHOOK_SIGNATURE_KEY environment variable');
      console.error('This can be found in the Square Developer Dashboard > Webhooks > Signature Key');
      return false;
    }

    console.log('Verifying webhook signature with key:', signatureKey.substring(0, 4) + '...');

    // Parse the signature header
    // Format: t=timestamp,v1=signature
    const signatureParts = signature.split(',');
    
    console.log('Signature parts:', JSON.stringify(signatureParts));
    
    if (signatureParts.length < 2) {
      console.warn('Invalid signature format: not enough parts');
      console.warn('Expected format: t=timestamp,v1=signature');
      console.warn('Received:', signature);
      return false;
    }
    
    const timestampPart = signatureParts[0];
    const signaturePart = signatureParts[1];
    
    if (!timestampPart || !signaturePart) {
      console.warn('Invalid signature format: missing parts');
      console.warn(`Timestamp part: ${timestampPart || 'missing'}`);
      console.warn(`Signature part: ${signaturePart || 'missing'}`);
      return false;
    }
    
    const timestamp = timestampPart.split('=')[1];
    const signatureValue = signaturePart.split('=')[1];
    
    if (!timestamp || !signatureValue) {
      console.warn('Missing timestamp or signature value');
      console.warn(`Timestamp: ${timestamp || 'missing'}`);
      console.warn(`Signature value: ${signatureValue || 'missing'}`);
      return false;
    }
    
    // Construct the string to sign
    const stringToSign = `${timestamp}.${body}`;
    console.log('String to sign starts with:', stringToSign.substring(0, 20) + '...');
    
    // Generate HMAC-SHA256
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(stringToSign);
    const computedSignature = hmac.digest('hex');
    
    console.log('Computed signature starts with:', computedSignature.substring(0, 8) + '...');
    console.log('Received signature starts with:', signatureValue.substring(0, 8) + '...');

    try {
      // Compare signatures (use a constant-time comparison to prevent timing attacks)
      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'hex'),
        Buffer.from(signatureValue, 'hex')
      );
      
      console.log('Signature verification result:', isValid ? 'valid ✅' : 'invalid ❌');
      return isValid;
    } catch (comparisonError) {
      console.error('Error comparing signatures:', comparisonError.message);
      console.error('This might indicate that the signature formats are incompatible');
      console.error('Computed signature length:', computedSignature.length);
      console.error('Received signature length:', signatureValue.length);
      return false;
    }
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Export with more descriptive names
module.exports = {
  getSquareCredentials,
  getSquareClient,
  generateStateParam,
  generateCodeVerifier,
  generateCodeChallenge,
  getRedirectUrl,
  generateOAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  refreshTokenWithRetry,
  revokeToken,
  testSquareConnection,
  getMerchantInfo,
  verifyWebhookSignature,
  // Export for tests
  createMockTokenResponse,
  createMockMerchantInfo,
  
  // Add OAuth token exchange function with PKCE support
  getOAuthToken: async (code, code_verifier = null) => {
    try {
      const tokenData = await exchangeCodeForToken(code, code_verifier);
      return {
        success: true,
        data: {
          merchantId: tokenData.merchant_id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_at
        }
      };
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      return {
        success: false,
        error: error.message || 'Failed to exchange code for token'
      };
    }
  }
};