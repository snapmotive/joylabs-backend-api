/**
 * Handlers for OAuth routes, separated to allow for Lambda function optimization
 */

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { 
  getMerchantInfo, 
  exchangeCodeForToken,
  generateOAuthUrl
} = require('./services/square');
const { 
  findUserBySquareMerchantId, 
  createUser, 
  updateUser 
} = require('./services/user');
const { authCors } = require('./middleware/cors');
const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { Client } = require('square');
const squareService = require('./services/square');

const app = express();
const dynamoDb = new DynamoDBClient();

const STATES_TABLE = process.env.STATES_TABLE;

// In-memory store for state parameters
const stateStore = new Map();

// Apply middlewares with special handling for Expo AuthSession
app.use((req, res, next) => {
  // Log request details for debugging
  console.log('OAuth request:', {
    path: req.path,
    method: req.method,
    origin: req.headers.origin || 'No origin',
    userAgent: req.headers['user-agent']
  });

  // Check if request is from Expo AuthSession
  const isExpoAuthSession = req.headers.origin?.startsWith('https://auth.expo.io') || 
                           req.headers['user-agent']?.includes('Expo');

  if (isExpoAuthSession) {
    console.log('Expo AuthSession request detected');
    // Use permissive CORS for Expo AuthSession
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, User-Agent, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }
  
  next();
});

// Parse JSON bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Register state endpoint with special CORS handling
app.options('/api/auth/register-state', (req, res) => {
  const origin = req.headers.origin;
  
  // Allow Expo AuthSession origins
  if (origin?.startsWith('https://auth.expo.io')) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
  res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Endpoint to register state parameter before OAuth flow
app.post('/api/auth/register-state', authCors(), async (req, res) => {
  console.log('POST to register-state endpoint received:', {
    headers: req.headers,
    body: req.body,
    tableName: STATES_TABLE,
    region: process.env.AWS_REGION
  });

  try {
    const { state } = req.body;

    if (!state) {
      console.error('Missing state parameter');
      return res.status(400).json({
        error: 'Missing state parameter'
      });
    }

    console.log('Preparing to store state in DynamoDB:', {
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      tableName: STATES_TABLE
    });

    // Store state in DynamoDB with 10-minute TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // Current time + 10 minutes in seconds
    const params = {
      TableName: STATES_TABLE,
      Item: marshall({
        state: state,
        timestamp: Date.now(),
        used: false,
        ttl: ttl,
        redirectUrl: req.body.redirectUrl || '/auth/success'
      })
    };

    console.log('Sending PutItem command to DynamoDB with params:', {
      ...params,
      Item: '(marshalled item)' // Don't log the actual item for security
    });

    const result = await dynamoDb.send(new PutItemCommand(params));
    
    console.log('DynamoDB PutItem result:', {
      statusCode: result.$metadata.httpStatusCode,
      requestId: result.$metadata.requestId
    });

    console.log(`State parameter '${state.substring(0, 5)}...${state.substring(state.length - 5)}' registered successfully`);
    return res.status(200).json({
      success: true,
      message: 'State parameter registered successfully'
    });

  } catch (error) {
    console.error('Error registering state parameter:', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Failed to register state parameter',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Square OAuth callback handler
app.get('/api/auth/square/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    console.log('Square callback received:', {
      hasCode: !!code,
      state,
      hasError: !!error,
      STATES_TABLE: STATES_TABLE,
      env_STATES_TABLE: process.env.STATES_TABLE,
      headers: req.headers,
      query: req.query
    });
    
    if (error) {
      console.error('Error from Square:', error);
      return res.redirect(`joylabs://square-callback?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.error('No code provided in Square callback');
      return res.redirect('joylabs://square-callback?error=missing_code');
    }

    if (!state) {
      console.error('No state provided in Square callback');
      return res.redirect('joylabs://square-callback?error=missing_state');
    }

    // Retrieve state data from DynamoDB
    const getStateParams = {
      TableName: STATES_TABLE,
      Key: marshall({
        state: state
      })
    };

    console.log('Retrieving state data from DynamoDB:', {
      tableName: STATES_TABLE,
      state: state,
      params: {
        ...getStateParams,
        Key: '(marshalled key)' // Don't log the actual key for security
      },
      region: process.env.AWS_REGION
    });

    const stateData = await dynamoDb.send(new GetItemCommand(getStateParams));
    
    console.log('DynamoDB GetItem response:', {
      hasItem: !!stateData.Item,
      metadata: stateData.$metadata,
      region: process.env.AWS_REGION,
      itemKeys: stateData.Item ? Object.keys(stateData.Item) : null
    });

    if (!stateData.Item) {
      console.error('Invalid state parameter:', {
        state,
        tableName: STATES_TABLE,
        region: process.env.AWS_REGION
      });
      return res.redirect('joylabs://square-callback?error=invalid_state');
    }

    const stateItem = unmarshall(stateData.Item);
    const code_verifier = stateItem.code_verifier;
    
    if (!code_verifier) {
      console.error('No code verifier found for state');
      return res.redirect('joylabs://square-callback?error=missing_code_verifier');
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await squareService.exchangeCodeForToken(code, code_verifier);
      console.log('Successfully exchanged code for tokens');

      // Get merchant info using the access token
      const client = new Client({
        accessToken: tokenResponse.access_token,
        environment: 'production'
      });

      const { result } = await client.merchantsApi.retrieveMerchant(tokenResponse.merchant_id);
      console.log('Retrieved merchant info');

      // Clean up used state
      const deleteStateParams = {
        TableName: STATES_TABLE,
        Key: marshall({
          state: state
        })
      };
      await dynamoDb.send(new DeleteItemCommand(deleteStateParams));

      // Build the redirect URL with all necessary parameters - using manual construction for better Safari compatibility
      const sanitizedBusinessName = encodeURIComponent(result.merchant.businessName || '');
      const finalRedirectUrl = `joylabs://square-callback?access_token=${encodeURIComponent(tokenResponse.access_token)}&refresh_token=${encodeURIComponent(tokenResponse.refresh_token)}&merchant_id=${encodeURIComponent(tokenResponse.merchant_id)}&business_name=${sanitizedBusinessName}`;

      // Debug logging for redirect URL
      console.log('DEBUG - Redirect URL details:', {
        baseRedirectUrl: 'joylabs://square-callback',
        finalUrl: finalRedirectUrl,
        manuallyConstructed: true,
        params: {
          access_token: `${tokenResponse.access_token.substring(0, 5)}...${tokenResponse.access_token.substring(tokenResponse.access_token.length - 5)}`,
          refresh_token: `${tokenResponse.refresh_token.substring(0, 5)}...${tokenResponse.refresh_token.substring(tokenResponse.refresh_token.length - 5)}`,
          merchant_id: tokenResponse.merchant_id,
          business_name: result.merchant.businessName
        }
      });

      console.log('Redirecting to app with tokens');
      return res.redirect(finalRedirectUrl);
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      return res.redirect(`joylabs://square-callback?error=token_exchange_failed&message=${encodeURIComponent(error.message)}`);
    }
  } catch (error) {
    console.error('Error in Square callback:', error);
    return res.redirect('joylabs://square-callback?error=server_error');
  }
});

// Token Validation Endpoints - support both GET and POST
app.options('/api/auth/validate-token', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

app.get('/api/auth/validate-token', async (req, res) => {
  try {
    console.log('Token validation request received (GET)');
    validateToken(req, res);
  } catch (error) {
    handleValidationError(error, res);
  }
});

app.post('/api/auth/validate-token', async (req, res) => {
  try {
    console.log('Token validation request received (POST)');
    validateToken(req, res);
  } catch (error) {
    handleValidationError(error, res);
  }
});

// Helper function to validate token
async function validateToken(req, res) {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Missing or invalid Authorization header');
    return res.status(401).json({
      success: false,
      message: 'Authentication failed - No bearer token provided'
    });
  }

  // Extract token
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('Empty token provided');
    return res.status(401).json({
      success: false,
      message: 'Authentication failed - Empty token'
    });
  }

  try {
    // Initialize Square client with the token
    console.log('Validating Square access token...');
    const squareClient = squareService.getSquareClient(token);
    
    // Attempt to validate the token by making a lightweight API call
    const { result } = await squareClient.merchantsApi.retrieveMerchant('me');
    
    if (!result || !result.merchant || !result.merchant.id) {
      console.error('Token validation failed: Invalid Square response');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed - Invalid merchant data'
      });
    }

    console.log('Token validation successful for merchant:', result.merchant.id);
    
    // Return success response
    return res.status(200).json({
      success: true,
      merchantId: result.merchant.id,
      businessName: result.merchant.business_name || result.merchant.business_email || 'Unknown'
    });
  } catch (error) {
    console.error('Square API token validation error:', {
      name: error.name,
      message: error.message,
      status: error.statusCode
    });

    return res.status(401).json({
      success: false,
      message: 'Authentication failed - Invalid token',
      error: error.message || 'Failed to validate Square token'
    });
  }
}

// Helper function to handle validation errors
function handleValidationError(error, res) {
  console.error('Unexpected token validation error:', error);
  return res.status(500).json({
    success: false,
    message: 'Server error during token validation',
    error: error.message
  });
}

// Export the serverless handler
module.exports.handler = serverless(app);

/**
 * Handle Square OAuth callback
 */
exports.handleSquareCallback = async (event) => {
  console.log('Received Square callback with query parameters:', event.queryStringParameters);
  
  const { code, state, error, app_callback } = event.queryStringParameters || {};
  
  // Handle errors from Square
  if (error) {
    console.error('Square OAuth error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `joylabs://square-callback?error=${encodeURIComponent(error)}&message=${encodeURIComponent('Authorization failed')}`
      }
    };
  }

  // Validate required parameters
  if (!code) {
    console.error('No code received from Square');
    return {
      statusCode: 302,
      headers: {
        Location: `joylabs://square-callback?error=missing_code&message=${encodeURIComponent('No authorization code received')}`
      }
    };
  }

  // Validate state parameter
  if (!state || !stateStore.has(state)) {
    console.error('Invalid state parameter');
    return {
      statusCode: 302,
      headers: {
        Location: `joylabs://square-callback?error=invalid_state&message=${encodeURIComponent('Invalid state parameter')}`
      }
    };
  }

  try {
    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const tokenResponse = await squareService.exchangeCodeForToken(code);
    
    // Get merchant info
    console.log('Getting merchant info...');
    const merchantInfo = await squareService.getMerchantInfo(tokenResponse.access_token);
    
    // Clear state from store
    stateStore.delete(state);

    // Build the redirect URL with all necessary parameters - using manual construction for better Safari compatibility
    const sanitizedBusinessName = encodeURIComponent(merchantInfo.businessName || '');
    const finalRedirectUrl = `joylabs://square-callback?access_token=${encodeURIComponent(tokenResponse.access_token)}&refresh_token=${encodeURIComponent(tokenResponse.refresh_token)}&merchant_id=${encodeURIComponent(tokenResponse.merchant_id)}&business_name=${sanitizedBusinessName}`;

    console.log('Redirecting to app with tokens');
    
    return {
      statusCode: 302,
      headers: {
        Location: finalRedirectUrl
      }
    };
  } catch (error) {
    console.error('Error in Square callback:', error);
    
    return {
      statusCode: 302,
      headers: {
        Location: `joylabs://square-callback?error=token_exchange_failed&message=${encodeURIComponent(error.message || 'Failed to exchange code for token')}`
      }
    };
  }
};

/**
 * Initialize Square OAuth flow
 */
exports.initializeSquareOAuth = async (event) => {
  try {
    console.log('Initializing Square OAuth:', {
      STATES_TABLE: STATES_TABLE,
      env_STATES_TABLE: process.env.STATES_TABLE,
      event: {
        headers: event.headers,
        requestContext: event.requestContext
      }
    });

    // Generate state parameter and PKCE values
    const state = squareService.generateStateParam();
    const codeVerifier = squareService.generateCodeVerifier();
    const codeChallenge = squareService.generateCodeChallenge(codeVerifier);
    
    console.log('Generated OAuth parameters:', {
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      hasCodeVerifier: !!codeVerifier,
      hasCodeChallenge: !!codeChallenge
    });

    // Store state and code verifier in DynamoDB with TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes
    const params = {
      TableName: STATES_TABLE,
      Item: marshall({
        state: state,
        code_verifier: codeVerifier,
        timestamp: Date.now(),
        used: false,
        ttl: ttl
      })
    };

    console.log('Storing state in DynamoDB:', {
      tableName: STATES_TABLE,
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      ttl: new Date(ttl * 1000).toISOString(),
      params: {
        ...params,
        Item: '(marshalled item)' // Don't log the actual item for security
      }
    });

    const putResult = await dynamoDb.send(new PutItemCommand(params));
    console.log('DynamoDB PutItem result:', {
      metadata: putResult.$metadata,
      success: putResult.$metadata.httpStatusCode === 200
    });

    // Generate OAuth URL
    const url = await squareService.generateOAuthUrl(state, codeChallenge);
    
    console.log('Generated OAuth URL:', {
      urlLength: url.length,
      containsState: url.includes(state),
      containsCodeChallenge: url.includes(codeChallenge)
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({ url })
    };
  } catch (error) {
    console.error('Error initializing Square OAuth:', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to initialize OAuth flow',
        message: error.message
      })
    };
  }
}; 