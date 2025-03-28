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

// Initialize express app for the lambda handler
const app = express();

// Initialize DynamoDB client
const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION });
const STATES_TABLE = process.env.DYNAMODB_STATES_TABLE;

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
    console.log('Square callback received:', {
      query: req.query,
      headers: {
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      }
    });

    const { code, state } = req.query;

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange the code for tokens
    const tokenResponse = await exchangeCodeForToken(code);
    
    // Get merchant info using the access token
    const merchantInfo = await getMerchantInfo(tokenResponse.access_token);

    // Find or create user
    let user = await findUserBySquareMerchantId(merchantInfo.merchant_id);
    
    if (!user) {
      user = await createUser({
        squareMerchantId: merchantInfo.merchant_id,
        merchantInfo,
        tokens: tokenResponse
      });
    } else {
      await updateUser(user.id, {
        merchantInfo,
        tokens: tokenResponse
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        merchantId: merchantInfo.merchant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Determine if request is from Expo AuthSession
    const isExpoAuthSession = req.headers.origin?.startsWith('https://auth.expo.io') || 
                             req.headers['user-agent']?.includes('Expo');

    if (isExpoAuthSession) {
      // For Expo AuthSession, return JSON response
      res.json({
        token,
        user: {
          id: user.id,
          merchantId: merchantInfo.merchant_id,
          businessName: merchantInfo.business_name
        }
      });
    } else {
      // For web browser, redirect with token
      const redirectUrl = new URL(process.env.FRONTEND_URL);
      redirectUrl.searchParams.set('token', token);
      res.redirect(redirectUrl.toString());
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Send appropriate error response based on client
    const isExpoAuthSession = req.headers.origin?.startsWith('https://auth.expo.io') || 
                             req.headers['user-agent']?.includes('Expo');
    
    if (isExpoAuthSession) {
      res.status(400).json({ error: error.message });
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/error?message=${encodeURIComponent(error.message)}`);
    }
  }
});

// Export the serverless handler
module.exports.squareCallback = serverless(app); 