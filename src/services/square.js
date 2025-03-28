/**
 * Square Service
 * Provides methods to interact with Square API
 */
const axios = require('axios');
const crypto = require('crypto');
const { Client } = require('square');
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
      applicationSecret: credentials.applicationSecret
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
  
  const client = new Client({
    accessToken: accessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: 'production',
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
 * Get merchant info
 */
async function getMerchantInfo(accessToken) {
  try {
    const client = getSquareClient(accessToken);
    const response = await client.merchantsApi.retrieveMerchant('me');
    console.log('Successfully retrieved merchant info');
    return response.result.merchant;
  } catch (error) {
    console.error('Error getting merchant info:', error);
    throw error;
  }
}

/**
 * Execute a Square API request with error handling
 * @param {Function} requestFn - Function that takes a Square client and returns a promise
 * @param {string} accessToken - Square access token
 * @returns {Promise<Object>} - Square API response
 */
async function executeSquareRequest(requestFn, accessToken) {
  try {
    const client = getSquareClient(accessToken);
    return await requestFn(client);
  } catch (error) {
    console.error('Square API error:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode || 500
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
  executeSquareRequest
};