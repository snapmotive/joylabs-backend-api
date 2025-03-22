require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const { Client, Environment } = require('square');

// AWS Secrets Manager client with connection reuse
let secretsManagerClient = null;
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
 * Get Square credentials from AWS Secrets Manager or environment variables
 */
const getSquareCredentials = async () => {
  // Early return for cached credentials if not expired
  if (squareCredentials && squareCredentials.cachedAt && 
      (Date.now() - squareCredentials.cachedAt) < CREDENTIALS_CACHE_TTL) {
    console.log('Using cached Square credentials');
    return squareCredentials;
  }
  
  try {
    // If running locally or environment variables are set, use them
    if (process.env.IS_OFFLINE || process.env.NODE_ENV === 'development') {
      console.log('Using local environment variables for Square credentials');
      
      squareCredentials = {
        applicationId: process.env.SQUARE_APPLICATION_ID,
        applicationSecret: process.env.SQUARE_APPLICATION_SECRET,
        webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
        environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
        cachedAt: Date.now()
      };
      
      console.log('Loaded credentials:', {
        environment: squareCredentials.environment,
        applicationId: squareCredentials.applicationId,
        hasWebhookKey: !!squareCredentials.webhookSignatureKey
      });
      
      return squareCredentials;
    }
    
    // Otherwise fetch from Secrets Manager
    const secretId = process.env.SQUARE_CREDENTIALS_SECRET;
    if (!secretId) {
      throw new Error('SQUARE_CREDENTIALS_SECRET environment variable is not set');
    }

    console.log('Fetching Square credentials from Secrets Manager with secret ID:', secretId);
    const secretsManager = getSecretsManager();
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
      hasWebhookSignatureKey: !!secretData.webhookSignatureKey || !!secretData.SQUARE_WEBHOOK_SIGNATURE_KEY,
      availableKeys: Object.keys(secretData)
    });
    
    // Try different possible key names
    const applicationId = secretData.applicationId || secretData.SQUARE_APPLICATION_ID;
    const applicationSecret = secretData.applicationSecret || secretData.SQUARE_APPLICATION_SECRET;
    const webhookSignatureKey = secretData.webhookSignatureKey || secretData.SQUARE_WEBHOOK_SIGNATURE_KEY || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    
    if (!applicationId || !applicationSecret) {
      throw new Error(`Invalid secret format: missing required fields. Available keys: ${Object.keys(secretData).join(', ')}`);
    }

    squareCredentials = {
      applicationId,
      applicationSecret,
      webhookSignatureKey,
      environment: process.env.SQUARE_ENVIRONMENT || 'production',
      cachedAt: Date.now()
    };
    
    console.log('Successfully loaded credentials from Secrets Manager with application ID:', squareCredentials.applicationId);
    console.log('Webhook signature key:', webhookSignatureKey ? 'present' : 'missing');
    
    // Validate the credentials format
    if (squareCredentials.applicationId.startsWith('sq0idp-') && 
        squareCredentials.applicationSecret.length > 0) {
      return squareCredentials;
    } else {
      throw new Error('Invalid credential format. Application ID should start with sq0idp-');
    }
  } catch (error) {
    console.error('Error fetching Square credentials:', error);
    
    // Add reusable error handling with specific actions for different error types
    if (error.code === 'ResourceNotFoundException') {
      console.error('Secret not found. Verify secret name and AWS region.');
    } else if (error.code === 'AccessDeniedException') {
      console.error('Permissions issue. Check IAM role has secretsmanager:GetSecretValue permission.');
    } else if (error.code === 'ThrottlingException') {
      console.error('Rate limited by AWS. Implement exponential backoff retry.');
    } else if (error.code === 'InternalServiceError') {
      console.error('AWS Secrets Manager service issue. Try again later.');
    }
    
    // Re-throw for caller to handle
    throw error;
  }
};

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
    return `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback`;
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
  createMockMerchantInfo
};