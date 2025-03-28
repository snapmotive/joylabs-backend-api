/**
 * Square Service
 * Provides methods to interact with Square API
 */
const axios = require('axios');
const crypto = require('crypto');
const { SquareClient } = require('square');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { WebhooksHelper } = require('@square/webhooks');

// Initialize AWS clients
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

// Cache for Square credentials and clients
let squareCredentials = null;
const squareClientCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const CREDENTIALS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for credentials

// Cache AWS clients for connection reuse
let secretsClient = null;
const getSecretsClient = () => {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION
    });
  }
  return secretsClient;
};

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
    console.log('Retrieving Square credentials from AWS Secrets Manager');
    
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({
      SecretId: process.env.SQUARE_CREDENTIALS_SECRET
    });
    
    const response = await client.send(command);
    const credentials = JSON.parse(response.SecretString);
    
    if (!credentials.application_id || !credentials.application_secret) {
      throw new Error('Invalid Square credentials format');
    }
    
    return {
      applicationId: credentials.application_id,
      applicationSecret: credentials.application_secret,
      webhookSignatureKey: credentials.webhook_signature_key
    };
  } catch (error) {
    console.error('Error getting Square credentials:', error);
    throw new Error('Failed to get Square credentials');
  }
}

/**
 * Get a configured Square API client with connection reuse
 */
const getSquareClient = (accessToken = null) => {
  const cacheKey = `${accessToken || 'default'}-${process.env.SQUARE_ENVIRONMENT}`;
  
  if (squareClientCache.has(cacheKey)) {
    console.log('Reusing existing Square client from cache');
    return squareClientCache.get(cacheKey);
  }
  
  console.log('Creating new Square client');
  
  const client = new SquareClient({
    accessToken: accessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
    userAgentDetail: 'JoyLabs Backend API'
  });
  
  squareClientCache.set(cacheKey, client);
  return client;
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

/**
 * Generate a state parameter for OAuth
 */
function generateStateParam() {
  return generateRandomString(48);
}

/**
 * Generate a code verifier for PKCE
 */
function generateCodeVerifier() {
  return generateRandomString(64);
}

/**
 * Generate a code challenge from a code verifier
 */
function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64');
  return hash
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Get the OAuth redirect URL
 */
const getRedirectUrl = () => {
  const apiGatewayUrl = process.env.API_GATEWAY_URL;
  if (!apiGatewayUrl) {
    throw new Error('API_GATEWAY_URL environment variable is required');
  }
  
  const callbackUrl = `${apiGatewayUrl}/api/auth/square/callback`;
  console.log(`Using redirect URL: ${callbackUrl}`);
  return callbackUrl;
};

/**
 * Validate redirect URI to ensure it's allowed
 */
function validateRedirectUri(redirect_uri) {
  const allowedRedirectUris = [
    'https://auth.expo.io/@snapmotive/joylabs',  // Expo AuthSession proxy
    'joylabs://square-callback',                  // Direct deep link
    process.env.SQUARE_REDIRECT_URL               // Backend callback URL
  ].filter(Boolean); // Remove any undefined values

  if (!allowedRedirectUris.includes(redirect_uri)) {
    console.error('Invalid redirect URI:', redirect_uri);
    console.error('Must be one of:', allowedRedirectUris);
    throw new Error('Invalid redirect URI');
  }

  return true;
}

/**
 * Generate OAuth URL with PKCE
 */
async function generateOAuthUrl(state, code_challenge, redirect_uri) {
  try {
    // Validate redirect URI
    validateRedirectUri(redirect_uri);
    
    const credentials = await getSquareCredentials();
    const client = getSquareClient();
    
    const params = new URLSearchParams({
      client_id: credentials.applicationId,
      response_type: 'code',
      scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE INVENTORY_READ INVENTORY_WRITE',
      state,
      code_challenge,
      code_challenge_method: 'S256',
      redirect_uri
    });

    const authUrl = `${process.env.SQUARE_AUTH_URL}?${params.toString()}`;
    console.log('Generated OAuth URL:', authUrl);
    
    return authUrl;
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    throw new Error('Failed to generate OAuth URL');
  }
}

/**
 * Exchange authorization code for OAuth token
 */
async function exchangeCodeForToken(code, code_verifier, redirect_uri) {
  console.log('Exchanging code for token with PKCE...');
  
  try {
    // Validate redirect URI
    validateRedirectUri(redirect_uri);
    
    const credentials = await getSquareCredentials();
    const client = getSquareClient();
    
    const response = await client.oAuthApi.obtainToken({
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
      code,
      code_verifier,
      redirect_uri,
      grant_type: 'authorization_code'
    });
    
    if (!response.result || !response.result.access_token) {
      throw new Error('Invalid token response');
    }
    
    const { access_token, refresh_token, expires_at, merchant_id } = response.result;
    
    return {
      access_token,
      refresh_token,
      expires_at: new Date(expires_at).getTime(),
      merchant_id
    };
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
}

/**
 * Refresh Square OAuth token
 */
async function refreshToken(refreshToken) {
  const credentials = await getSquareCredentials();
  const baseUrl = 'https://connect.squareup.com';
  
  try {
    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: credentials.applicationId,
      client_secret: credentials.applicationSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    
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
 * Get merchant info with caching
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
}, 'merchantInfo', 30 * 60 * 1000);

const getMerchantInfo = getMerchantInfoWithCache;

/**
 * Refresh token with retry logic
 */
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
      
      if (error.status && error.status >= 500) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.status === 429) {
        retries++;
        const delay = Math.pow(2, retries) * 2000;
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * Get axios instance with connection pooling
 */
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
 */
async function verifyWebhookSignature(signature, body) {
  try {
    const credentials = await getSquareCredentials();
    return WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: credentials.webhookSignatureKey,
      notificationUrl: process.env.SQUARE_WEBHOOK_URL
    });
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Exchange OAuth authorization code for tokens with PKCE support
 */
async function getOAuthToken(code, code_verifier = null) {
  try {
    console.log(`Exchanging code for token with${code_verifier ? '' : 'out'} PKCE`);
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

/**
 * List catalog items from Square
 */
async function listCatalog(client, options = {}) {
  const catalogApi = client.catalogApi;
  try {
    console.log('Listing catalog items from Square');
    const response = await catalogApi.listCatalog(undefined, options.types || 'ITEM,CATEGORY');
    return response.result;
  } catch (error) {
    console.error('Error listing catalog items:', error);
    throw error;
  }
}

/**
 * Cache Square OAuth tokens in DynamoDB
 */
async function cacheSquareTokens(merchantId, tokens) {
  try {
    const params = {
      TableName: process.env.SQUARE_TOKENS_TABLE || 'square-tokens',
      Item: {
        merchantId,
        ...tokens,
        updatedAt: new Date().toISOString()
      }
    };

    await dynamoDb.send(new PutCommand(params));
    console.log('Cached Square tokens for merchant:', merchantId);
  } catch (error) {
    console.error('Error caching Square tokens:', error);
    throw error;
  }
}

// Export functions
module.exports = {
  generateOAuthUrl,
  exchangeCodeForToken,
  getMerchantInfo,
  getSquareClient,
  generateStateParam,
  generateCodeVerifier,
  generateCodeChallenge,
  getSquareCredentials,
  refreshToken,
  revokeToken,
  testSquareConnection,
  refreshTokenWithRetry,
  verifyWebhookSignature,
  getOAuthToken,
  listCatalog,
  cacheSquareTokens
};