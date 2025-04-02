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
const catalogService = require('./services/catalog');
const { safeSerialize } = require('./utils/errorHandling');
const squareService = require('./services/square');

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
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    headers: req.headers,
    query: req.query,
  });
  next();
});

// Direct handler for the categories endpoint
app.get('/v2/catalog/categories', protect, async (req, res) => {
  console.log('[REQUEST] Categories endpoint accessed:', req.path, req.originalUrl);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;

    // Call the catalog service to get categories
    console.log('[CATEGORIES] Calling catalogService.getCatalogCategories');
    const result = await catalogService.getCatalogCategories(token);

    console.log('[CATEGORIES] Service call complete. Success:', result.success);
    console.log('[CATEGORIES] Categories count:', result.categories ? result.categories.length : 0);

    if (!result.success) {
      console.error('Error fetching categories:', result.error || result.message);
      return res.status(result.status || 500).json(result);
    }

    // Include merchant metadata in response
    const enrichedResult = {
      ...result,
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
      },
    };

    // Ensure response is safe to serialize
    const safeResult = safeSerialize(enrichedResult);
    return res.json(safeResult);
  } catch (error) {
    console.error('Error in categories endpoint:', error);
    // Handle and serialize error response
    const errorResponse = safeSerialize({
      success: false,
      message: error.message || 'Internal server error',
      error: error.toString(),
    });
    return res.status(500).json(errorResponse);
  }
});

// NEW ENDPOINT: List all categories using the simpler ListCatalog endpoint
app.get('/v2/catalog/list-categories', protect, async (req, res) => {
  console.log('[REQUEST] List categories endpoint accessed:', req.path, req.originalUrl);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;

    // Call the catalog service to list all categories using the function that doesn't access DynamoDB
    console.log('[LIST-CATEGORIES] Calling catalogService.listCatalogCategories');
    const result = await catalogService.listCatalogCategories(token, {
      limit: 200, // Increase limit to get more categories
    });

    console.log('[LIST-CATEGORIES] Service call complete. Success:', result.success);
    console.log('[LIST-CATEGORIES] Categories count:', result.objects ? result.objects.length : 0);

    if (!result.success) {
      console.error('Error listing categories:', result.error || result.message);
      return res.status(result.status || 500).json(result);
    }

    // Include merchant metadata in response
    const enrichedResult = {
      ...result,
      categories: result.objects || [], // Rename to categories for consistency
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'ListCatalog',
      },
    };

    // Ensure response is safe to serialize
    const safeResult = safeSerialize(enrichedResult);
    return res.json(safeResult);
  } catch (error) {
    console.error('Error in list categories endpoint:', error);
    // Handle and serialize error response
    const errorResponse = safeSerialize({
      success: false,
      message: error.message || 'Internal server error',
      error: error.toString(),
    });
    return res.status(500).json(errorResponse);
  }
});

// Handle the root handler for the /v2/catalog/list route
app.get('/v2/catalog/list', protect, async (req, res) => {
  console.log('[REQUEST] List endpoint accessed:', req.path, req.originalUrl);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;

    // Parse query parameters
    const { types = 'ITEM', limit = 100, cursor } = req.query;

    // Make direct API call to Square
    const axios = require('axios');

    console.log(
      'Making ListCatalog request with params:',
      JSON.stringify(
        {
          types: Array.isArray(types) ? types.join(',') : types,
          limit: parseInt(limit),
          cursor,
        },
        null,
        2
      )
    );

    const response = await axios({
      method: 'get',
      url: 'https://connect.squareup.com/v2/catalog/list',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': '2023-12-13',
      },
      params: {
        types: Array.isArray(types) ? types.join(',') : types,
        limit: parseInt(limit),
        cursor,
      },
    });

    // Include merchant metadata in response
    const enrichedResult = {
      success: true,
      objects: response.data.objects || [],
      cursor: response.data.cursor,
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'ListCatalog',
      },
    };

    // Ensure response is safe to serialize
    const safeResult = safeSerialize(enrichedResult);
    return res.json(safeResult);
  } catch (error) {
    console.error('Error in list endpoint:', error);
    // Handle and serialize error response
    const errorResponse = safeSerialize({
      success: false,
      message: error.message || 'Internal server error',
      error: error.toString(),
    });
    return res.status(500).json(errorResponse);
  }
});

// Mount catalog routes with v2 format only
app.use('/v2/catalog', catalogRoutes);

// Handle root path directly
app.get('/', (req, res) => {
  // For the base path, provide info but don't redirect
  res.json({
    message: 'JoyLabs Catalog API',
    note: 'Please use the Square-compatible /v2/catalog paths',
    baseUrl: '/v2/catalog',
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
      categories: '/categories',
      batchRetrieve: '/batch-retrieve',
      batchUpsert: '/batch-upsert',
      batchDelete: '/batch-delete',
      updateModifierLists: '/item/:id/modifier-lists',
      updateTaxes: '/item/:id/taxes',
    },
    note: 'This API uses the Square-compatible /v2/catalog/... path format.',
  });
});

// Handle legacy routes by returning a clear message instead of redirecting
app.use('/api/catalog', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the v2/catalog endpoints instead.',
    newBasePath: '/v2/catalog',
  });
});

// OPTIONS preflight handling
app.options('*', configureCors());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Catalog API Error:', err);

  const errorResponse = safeSerialize({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.stack,
  });

  res.status(err.status || 500).json(errorResponse);
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
    query,
  });
};

// Centralized error handler
const handleError = (error, path) => {
  console.error(`Error in catalog handler (${path}):`, {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode || 500,
    stack: error.stack,
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
        code: error.code || 'server_error',
      }),
    };
  }

  return {
    statusCode,
    body: safeJSONStringify({
      success: false,
      error: message,
      code: error.code || 'server_error',
    }),
  };
};

// Middleware to extract and validate auth token
const authenticateRequest = async event => {
  try {
    // Get the authorization header, accounting for different event structures
    let authHeader;

    // In Node.js 22, header names are normalized to lowercase
    // Check for authorization header using lowercase consistently
    if (event.headers && event.headers.authorization) {
      authHeader = event.headers.authorization;
    }
    // For backwards compatibility, still check Authorization with capital A
    // but standardize on the lowercase version moving forward
    else if (event.headers && event.headers.Authorization) {
      // This branch is for compatibility with older code, prefer lowercase
      authHeader = event.headers.Authorization;
    }
    // Check multiValueHeaders from API Gateway v1
    else if (event.multiValueHeaders) {
      if (event.multiValueHeaders.authorization && event.multiValueHeaders.authorization[0]) {
        authHeader = event.multiValueHeaders.authorization[0];
      } else if (
        event.multiValueHeaders.Authorization &&
        event.multiValueHeaders.Authorization[0]
      ) {
        // For backwards compatibility
        authHeader = event.multiValueHeaders.Authorization[0];
      }
    }

    console.log('Auth header found:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header');
      return {
        isAuthenticated: false,
        error: {
          statusCode: 401,
          message: 'Missing or invalid authorization header',
        },
      };
    }

    const token = authHeader.split(' ')[1];

    // Validate token by making a lightweight request to Square API
    try {
      // Use our squareService to properly handle different API versions
      const merchantInfo = await squareService.getMerchantInfo(token);

      if (!merchantInfo || !merchantInfo.id) {
        return {
          isAuthenticated: false,
          error: {
            statusCode: 401,
            message: 'Invalid merchant data',
          },
        };
      }

      console.log('Authenticated merchant:', {
        merchantId: merchantInfo.id,
        businessName: merchantInfo.businessName || 'Unknown',
      });

      return {
        isAuthenticated: true,
        user: {
          merchantId: merchantInfo.id,
          squareAccessToken: token,
          businessName: merchantInfo.businessName || 'Unknown',
        },
      };
    } catch (error) {
      console.error('Token validation error:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      });

      return {
        isAuthenticated: false,
        error: {
          statusCode: 401,
          message: 'Invalid access token: ' + (error.message || 'Unknown error'),
        },
      };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      isAuthenticated: false,
      error: {
        statusCode: 500,
        message: 'Server error during authentication',
      },
    };
  }
};

/**
 * Helper function to safely serialize objects with BigInt values
 * Uses the safeSerialize utility from errorHandling
 * @param {Object} data - The data to serialize
 * @returns {string} - JSON string
 */
const safeJSONStringify = data => {
  // Use the shared safeSerialize utility
  const safeData = safeSerialize(data);
  return JSON.stringify(safeData);
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
          'Access-Control-Allow-Headers':
            'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: safeJSONStringify({ message: 'CORS preflight successful' }),
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
          'Content-Type': 'application/json',
        },
        body: safeJSONStringify({ error: authResult.error.message }),
      };
    }

    const { user } = authResult;

    // Check the path to determine which handler to call
    if (path.includes('/v2/catalog/list')) {
      // List catalog items
      const { types = 'ITEM,CATEGORY', limit = 100, cursor } = queryParams;

      console.log('Listing catalog items with params:', { types, limit, cursor });

      try {
        // Use the Square client to directly list catalog items
        // This bypasses our service that tries to access DynamoDB
        const client = squareService.getSquareClient(user.squareAccessToken);

        // Parse types properly
        const typesArray = typeof types === 'string' ? types.split(',') : types;

        console.log(
          'Direct ListCatalog API call with request:',
          JSON.stringify(
            {
              types: typesArray,
              limit: parseInt(limit),
              cursor,
            },
            null,
            2
          )
        );

        // CORRECT SDK USAGE: Pass individual parameters instead of an object
        const squareResponse = await client.catalog.listCatalog(
          typesArray,
          cursor,
          parseInt(limit)
        );

        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: safeJSONStringify({
            success: true,
            objects: squareResponse.result.objects || [],
            cursor: squareResponse.result.cursor,
          }),
        };
      } catch (error) {
        console.error('Error directly calling Square ListCatalog API:', error);
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: safeJSONStringify({
            success: false,
            error: error.message || 'Error calling Square API',
            details: error.errors || [],
          }),
        };
      }
    }

    // Add other route handlers here
    // ...

    // Return 404 if no matching route
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: safeJSONStringify({ error: 'Route not found' }),
    };
  } catch (error) {
    console.error('Unhandled error in catalog handler:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: safeJSONStringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

// Add a catch-all handler at the end
app.use('*', (req, res) => {
  console.log('Catch-all route handler - Path not found:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
  });

  res.status(404).json({
    success: false,
    error: 'Route not found',
    requestedPath: req.originalUrl,
  });
});

// Delete conflicting exports to clean up
if (exports.handler) {
  delete exports.handler;
}

// Correctly export the Express app handler using serverless-http
module.exports.handler = serverless(app);
