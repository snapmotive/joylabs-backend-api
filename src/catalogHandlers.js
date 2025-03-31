/**
 * Catalog API Lambda Handler
 * Handles all catalog-related API endpoints
 */
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { protect } = require('./middleware/auth');
const configureCors = require('./middleware/cors');
const catalogRoutes = require('./routes/catalog');
const { getSquareClient, executeSquareRequest } = require('./services/square');

// Initialize express app
const app = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Apply CORS
app.use(configureCors());

// Performance monitoring middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // Track response time after request completes
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    // Log slow requests (over 500ms)
    if (duration > 500) {
      console.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
  });
  
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log('Incoming catalog request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    query: req.query
  });
  next();
});

// Mount catalog routes with v2 format only
app.use('/v2/catalog', catalogRoutes);

// Handle root path directly
app.get('/', (req, res) => {
  // For the base path, provide info but don't redirect
  res.json({
    message: 'JoyLabs Catalog API',
    note: 'Please use the Square-compatible /v2/catalog paths',
    baseUrl: '/v2/catalog'
  });
});

// Root path for v2/catalog
app.get('/v2/catalog', (req, res) => {
  res.json({ 
    message: 'JoyLabs Catalog API', 
    endpoints: {
      list: '/list',
      item: '/item/:id',
      search: '/search',
      batchRetrieve: '/batch-retrieve',
      batchUpsert: '/batch-upsert',
      batchDelete: '/batch-delete',
      updateModifierLists: '/item/:id/modifier-lists',
      updateTaxes: '/item/:id/taxes'
    },
    note: 'This API uses the Square-compatible /v2/catalog/... path format.'
  });
});

// Handle legacy routes by returning a clear message instead of redirecting
app.use('/api/catalog', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the v2/catalog endpoints instead.',
    newBasePath: '/v2/catalog'
  });
});

// OPTIONS preflight handling
app.options('*', configureCors());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Catalog API Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.stack
  });
});

// Enhanced logging for debugging
const logRequest = (event, context) => {
  console.log('Raw event:', JSON.stringify(event));
  
  // Extract method, path, headers and query parameters
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.requestContext?.http?.path;
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  
  console.log('Incoming catalog request:', {
    method,
    path,
    headers,
    query
  });
};

// Centralized error handler
const handleError = (error, path) => {
  console.error(`Error in catalog handler (${path}):`, {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode || 500,
    stack: error.stack
  });

  let statusCode = error.statusCode || 500;
  let message = error.message || 'An unexpected error occurred';
  
  // Format the error response
  if (error.errors) {
    return {
      statusCode,
      body: safeJSONStringify({
        success: false,
        error: message,
        errors: error.errors,
        code: error.code || 'server_error'
      })
    };
  }

  return {
    statusCode,
    body: safeJSONStringify({
      success: false,
      error: message,
      code: error.code || 'server_error'
    })
  };
};

// Middleware to extract and validate auth token
const authenticateRequest = async (event) => {
  try {
    // Get the authorization header, accounting for different event structures
    let authHeader;
    
    // Check if the event has headers directly (Lambda direct invocation)
    if (event.headers && event.headers.authorization) {
      authHeader = event.headers.authorization;
    } 
    // Check if the headers have Authorization with capital A (API Gateway)
    else if (event.headers && event.headers.Authorization) {
      authHeader = event.headers.Authorization;
    }
    // Check multiValueHeaders from API Gateway v1
    else if (event.multiValueHeaders && (event.multiValueHeaders.authorization || event.multiValueHeaders.Authorization)) {
      authHeader = (event.multiValueHeaders.authorization || event.multiValueHeaders.Authorization)[0];
    }
    
    console.log('Auth header found:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header');
      return {
        isAuthenticated: false,
        error: {
          statusCode: 401,
          message: 'Missing or invalid authorization header'
        }
      };
    }
    
    const token = authHeader.split(' ')[1];
    
    // Validate token by making a lightweight request to Square API
    try {
      const squareClient = getSquareClient(token);
      const { result } = await squareClient.merchantsApi.retrieveMerchant('me');
      
      if (!result || !result.merchant) {
        return {
          isAuthenticated: false,
          error: {
            statusCode: 401,
            message: 'Invalid merchant data'
          }
        };
      }
      
      console.log('Authenticated merchant:', {
        merchantId: result.merchant.id,
        businessName: result.merchant.business_name || 'Unknown'
      });
      
      return {
        isAuthenticated: true,
        user: {
          merchantId: result.merchant.id,
          squareAccessToken: token,
          businessName: result.merchant.business_name || result.merchant.business_email || 'Unknown'
        }
      };
    } catch (error) {
      console.error('Token validation error:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
      
      return {
        isAuthenticated: false,
        error: {
          statusCode: 401,
          message: 'Invalid access token: ' + (error.message || 'Unknown error')
        }
      };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      isAuthenticated: false,
      error: {
        statusCode: 500,
        message: 'Server error during authentication'
      }
    };
  }
};

/**
 * Helper function to safely serialize objects with BigInt values
 * @param {Object} data - The data to serialize
 * @returns {string} - JSON string
 */
const safeJSONStringify = (data) => {
  return JSON.stringify(data, (_, value) => 
    typeof value === 'bigint' 
      ? value.toString() 
      : value
  );
};

// Main handler function
const handler = async (event, context) => {
  try {
    logRequest(event, context);
    
    // Check if this is an OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: safeJSONStringify({ message: 'CORS preflight successful' })
      };
    }
    
    // Parse URL path to determine the route
    const path = event.path || event.requestContext?.http?.path || '';
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
    const queryParams = event.queryStringParameters || {};
    
    // Authenticate the request
    const authResult = await authenticateRequest(event);
    if (!authResult.isAuthenticated) {
      return {
        statusCode: authResult.error.statusCode,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: safeJSONStringify({ error: authResult.error.message })
      };
    }
    
    const { user } = authResult;
    
    // Check the path to determine which handler to call
    if (path.includes('/v2/catalog/list')) {
      // List catalog items
      const { types = 'ITEM,CATEGORY', limit = 100, cursor } = queryParams;
      
      console.log('Listing catalog items with params:', { types, limit, cursor });
      
      const response = await executeSquareRequest(async (client) => {
        return await client.catalogApi.listCatalog(cursor, types);
      }, user.squareAccessToken);
      
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: safeJSONStringify(response)
      };
    }
    
    // Add other route handlers here
    // ...
    
    // Return 404 if no matching route
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: safeJSONStringify({ error: 'Route not found' })
    };
  } catch (error) {
    console.error('Unhandled error in catalog handler:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: safeJSONStringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

// Delete conflicting exports to clean up
if (exports.handler) {
  delete exports.handler;
}

// Single, consistent export
module.exports.handler = handler; 