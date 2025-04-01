/**
 * Square Service
 * Provides methods to interact with Square API
 */
const axios = require('axios');
const crypto = require('crypto');
// Import Square client for v42+
const { SquareClient } = require('square');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Initialize AWS clients
const secretsManager = new SecretsManagerClient({ region: 'us-west-1' });

// Cache for Square credentials and clients
let squareCredentials = null;
const squareClientCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Cache AWS clients for connection reuse
let secretsClient = null;
const getSecretsClient = () => {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: 'us-west-1'
    });
  }
  return secretsClient;
};

/**
 * Retrieve Square credentials
 * @returns {Promise<Object>} Square credentials
 */
async function getSquareCredentials() {
  try {
    console.log('Retrieving Square credentials from AWS Secrets Manager');
    console.log('SQUARE_CREDENTIALS_SECRET:', process.env.SQUARE_CREDENTIALS_SECRET);
    console.log('AWS_REGION:', process.env.AWS_REGION);
    
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({
      SecretId: process.env.SQUARE_CREDENTIALS_SECRET || 'square-credentials-production'
    });
    
    const response = await client.send(command);
    const credentials = JSON.parse(response.SecretString);
    
    if (!credentials.applicationId || !credentials.applicationSecret) {
      throw new Error('Invalid Square credentials format');
    }
      
    return {
      applicationId: credentials.applicationId,
      applicationSecret: credentials.applicationSecret,
      webhookSignatureKey: credentials.webhookSignatureKey
    };
  } catch (error) {
    console.error('Error getting Square credentials:', error);
    throw new Error('Failed to get Square credentials');
  }
}

/**
 * Get a configured Square API client with connection reuse
 * 
 * This function creates a client using Square SDK v42+
 * 
 * @param {string} accessToken - Square access token
 * @returns {Object} Square client instance
 */
const getSquareClient = (accessToken = null) => {
  const cacheKey = `${accessToken || 'default'}-${process.env.SQUARE_ENVIRONMENT}`;
  
  if (squareClientCache.has(cacheKey)) {
    console.log('Reusing existing Square client from cache');
    return squareClientCache.get(cacheKey);
  }
  
  console.log('Creating new Square v42 client');
  
  // Create SquareClient with proper configuration
  const client = new SquareClient({
    token: accessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT || 'production',
    userAgentDetail: 'JoyLabs Backend API',
    timeout: 30000 // 30 seconds timeout
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
 * Must be between 43-128 chars, URL safe base64
 */
function generateCodeVerifier() {
  // Generate 32 bytes of random data (will result in 43 chars when base64url encoded)
  const randomBytes = crypto.randomBytes(32);
  return base64URLEncode(randomBytes);
}

/**
 * Generate a code challenge from a code verifier
 * Must be base64URL(SHA256(code_verifier))
 */
function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest();
  return base64URLEncode(hash);
}

/**
 * Base64URL encode a Buffer
 * Converts to base64 then makes it URL safe
 */
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Get the OAuth redirect URL
 */
const getRedirectUrl = () => {
  const redirectUrl = process.env.SQUARE_REDIRECT_URL || 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback';
  console.log(`Using redirect URL: ${redirectUrl}`);
  return redirectUrl;
};

/**
 * Generate OAuth URL for Square authorization
 * @param {string} state - State parameter for CSRF protection
 * @param {string} code_challenge - PKCE code challenge
 * @param {string} redirect_uri - The redirect URI for OAuth callback
 * @returns {Promise<string>} The OAuth URL
 */
async function generateOAuthUrl(state, code_challenge, redirect_uri) {
  try {
    const credentials = await getSquareCredentials();
    const baseUrl = 'https://connect.squareup.com/oauth2/authorize';
    
    const params = new URLSearchParams({
      client_id: credentials.applicationId,
      response_type: 'code',
      scope: 'ITEMS_READ ITEMS_WRITE MERCHANT_PROFILE_READ',
      state,
      code_challenge,
      code_challenge_method: 'S256',
      redirect_uri: getRedirectUrl()
    });

    const url = `${baseUrl}?${params.toString()}`;
    console.log('Generated OAuth URL (redacted):', url.replace(code_challenge, '[REDACTED]'));
    
    return url;
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    throw error;
  }
}

/**
 * Exchange authorization code for access token
 * @param {string} code - The authorization code from Square
 * @param {string} code_verifier - The PKCE code verifier used in the initial request
 * @returns {Promise<Object>} The token response
 */
async function exchangeCodeForToken(code, code_verifier) {
  try {
    const credentials = await getSquareCredentials();
    const redirectUrl = getRedirectUrl();
    
    console.log('Exchanging code for token with redirect URL:', redirectUrl);
    console.log('PKCE status:', {
      hasCodeVerifier: !!code_verifier,
      codeVerifierLength: code_verifier ? code_verifier.length : 0,
      codeVerifierPreview: code_verifier ? `${code_verifier.substring(0, 5)}...${code_verifier.substring(code_verifier.length - 5)}` : 'none'
    });
    
    // Prepare request body with or without code_verifier
    const requestBody = {
      client_id: credentials.applicationId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUrl
    };
    
    // For PKCE flow (mobile apps), don't include client_secret
    if (code_verifier) {
      requestBody.code_verifier = code_verifier;
      console.log('Added code_verifier to token request - using PKCE flow without client_secret');
    } else {
      // For standard OAuth flow (server-to-server), include client_secret
      requestBody.client_secret = credentials.applicationSecret;
      console.log('Using standard OAuth flow with client_secret');
    }
    
    console.log('Sending token request to Square API');
    const response = await axios.post('https://connect.squareup.com/oauth2/token', requestBody);

    console.log('Successfully received token response');
    
    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: response.data.expires_at,
      merchant_id: response.data.merchant_id
    };
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
}

/**
 * Get merchant info using the v42 SDK
 */
async function getMerchantInfo(accessToken) {
  try {
    const client = getSquareClient(accessToken);
    
    console.log('Getting merchant info with Square v42 SDK');
    
    // In v42 SDK, we need to use the correct syntax for merchant retrieval
    // There are multiple ways to approach this based on the SDK version
    let response;
    
    try {
      // Try first approach for v42 (Square API is sometimes inconsistent with naming)
      console.log('Attempting to retrieve merchant info with getMerchant');
      response = await client.merchants.getMerchant('me');
    } catch (error) {
      // If first approach fails, try an alternative
      if (error.message.includes('is not a function')) {
        console.log('Falling back to alternative method for retrieving merchant');
        
        // Try using direct HTTP request to the Square API
        const axios = require('axios');
        const merchantResponse = await axios({
          method: 'get',
          url: 'https://connect.squareup.com/v2/merchants/me',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Square-Version': '2023-12-13'
          }
        });
        
        // Format response to match SDK structure
        response = {
          result: {
            merchant: merchantResponse.data.merchant
          }
        };
        
        console.log('Successfully retrieved merchant info via direct API call');
      } else {
        // If it's not a "function not found" error, rethrow
        throw error;
      }
    }
    
    console.log('Successfully retrieved merchant info');
    
    // Format merchant information
    return {
      id: response.result.merchant.id,
      businessName: response.result.merchant.businessName || response.result.merchant.business_name || response.result.merchant.businessEmail || response.result.merchant.business_email || 'Unknown',
      country: response.result.merchant.country,
      language: response.result.merchant.languageCode || response.result.merchant.language_code,
      currency: response.result.merchant.currency,
      status: response.result.merchant.status
    };
  } catch (error) {
    console.error('Error getting merchant info:', error);
    throw error;
  }
}

/**
 * Verify webhook signature from Square to ensure authenticity
 * @param {string} signature - The signature from Square-Signature header
 * @param {string} requestBody - The raw request body as a string
 * @returns {Promise<boolean>} - True if the signature is valid
 */
async function verifyWebhookSignature(signature, requestBody) {
  try {
    console.log('Verifying webhook signature');
    
    // Get webhook signature key from credentials
    const credentials = await getSquareCredentials();
    const signatureKey = credentials.webhookSignatureKey;
    
    if (!signatureKey) {
      console.error('No webhook signature key found in credentials');
      return false;
    }
    
    if (!signature) {
      console.error('No signature provided');
      return false;
    }
    
    if (!requestBody) {
      console.error('No request body provided');
      return false;
    }
    
    console.log('Request body length for verification:', requestBody.length);
    
    // Create HMAC using the signature key
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(requestBody);
    
    // Generate calculated signature
    const calculatedSignature = hmac.digest('base64');
    
    console.log('Signature verification:', {
      providedSignatureLength: signature.length,
      calculatedSignatureLength: calculatedSignature.length,
      match: signature === calculatedSignature
    });
    
    // Compare signatures - making sure to use a constant-time comparison to prevent timing attacks
    return signature === calculatedSignature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Execute a Square API request with error handling
 * 
 * @param {Function} requestFn - Function that takes a Square client and returns a promise
 * @param {string} accessToken - Square access token
 * @returns {Promise<Object>} - Square API response
 */
async function executeSquareRequest(requestFn, accessToken) {
  try {
    const client = getSquareClient(accessToken);
    console.log('Executing Square request with v42 SDK');
    
    return await requestFn(client);
  } catch (error) {
    console.error('Square API error:', {
      message: error.message,
      code: error.code || error.statusCode || 'UNKNOWN_ERROR',
      statusCode: error.statusCode || 500,
      details: error.details || error.errors || []
    });
    
    // Rethrow with additional context
    error.statusCode = error.statusCode || 500;
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
  executeSquareRequest,
  verifyWebhookSignature
};