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
  const { path, headers, query, method } = event;
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
      body: JSON.stringify({
        success: false,
        error: message,
        errors: error.errors,
        code: error.code || 'server_error'
      })
    };
  }

  return {
    statusCode,
    body: JSON.stringify({
      success: false,
      error: message,
      code: error.code || 'server_error'
    })
  };
};

// Middleware to extract and validate auth token
const authenticateRequest = async (event) => {
  try {
    const authHeader = event.headers?.authorization;
    
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

// List catalog items with optional filtering
const listCatalogItems = async (event) => {
  try {
    logRequest(event);
    
    // Authenticate the request
    const authResult = await authenticateRequest(event);
    if (!authResult.isAuthenticated) {
      return {
        statusCode: authResult.error.statusCode,
        body: JSON.stringify({ error: authResult.error.message })
      };
    }
    
    const { user } = authResult;
    const { types = 'ITEM', limit = 100, cursor } = event.query || {};
    
    console.log('Listing catalog items with params:', { types, limit, cursor });
    
    const response = await executeSquareRequest(async (client) => {
      return await client.catalogApi.listCatalog(cursor, types);
    }, user.squareAccessToken);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        objects: response.result.objects || [],
        cursor: response.result.cursor
      })
    };
  } catch (error) {
    return handleError(error, '/v2/catalog/list');
  }
};

// Get catalog item by ID
const getCatalogItem = async (event) => {
  try {
    logRequest(event);
    
    // Authenticate the request
    const authResult = await authenticateRequest(event);
    if (!authResult.isAuthenticated) {
      return {
        statusCode: authResult.error.statusCode,
        body: JSON.stringify({ error: authResult.error.message })
      };
    }
    
    const { user } = authResult;
    const { id } = event.pathParameters || {};
    
    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Item ID is required' })
      };
    }
    
    console.log('Getting catalog item:', { id });
    
    const response = await executeSquareRequest(async (client) => {
      return await client.catalogApi.retrieveCatalogObject(id, true);
    }, user.squareAccessToken);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        object: response.result.object,
        relatedObjects: response.result.relatedObjects || []
      })
    };
  } catch (error) {
    return handleError(error, '/v2/catalog/item/{id}');
  }
};

// Search catalog items
const searchCatalogItems = async (event) => {
  try {
    logRequest(event);
    
    // Authenticate the request
    const authResult = await authenticateRequest(event);
    if (!authResult.isAuthenticated) {
      return {
        statusCode: authResult.error.statusCode,
        body: JSON.stringify({ error: authResult.error.message })
      };
    }
    
    const { user } = authResult;
    
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }
    
    console.log('Searching catalog with criteria:', JSON.stringify(body));
    
    const response = await executeSquareRequest(async (client) => {
      return await client.catalogApi.searchCatalogObjects(body);
    }, user.squareAccessToken);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        objects: response.result.objects || [],
        cursor: response.result.cursor,
        matchedVariationIds: response.result.matchedVariationIds || []
      })
    };
  } catch (error) {
    return handleError(error, '/v2/catalog/search');
  }
};

// Consolidate handler exports to avoid conflicts
try {
  // Route handler for catalog requests
  const handler = async (event, context) => {
    try {
      logRequest(event, context);
      
      // Get HTTP method and path
      const { path, httpMethod } = event;
      
      // Convert API Gateway event to Express request format
      let response;
      
      // Handle specific catalog endpoints directly for better performance
      if (path.endsWith('/v2/catalog/list') && httpMethod === 'GET') {
        response = await listCatalogItems(event);
      } else if (path.match(/\/v2\/catalog\/item\/[\w-]+$/) && httpMethod === 'GET') {
        response = await getCatalogItem(event);
      } else if (path === '/v2/catalog/search' && httpMethod === 'POST') {
        response = await searchCatalogItems(event);
      } else {
        // Fall back to Express for other routes
        return serverless(app)(event, context);
      }
      
      return response;
    } catch (error) {
      return handleError(error, event.path);
    }
  };
  
  // Delete conflicting exports to clean up
  if (exports.handler) {
    delete exports.handler;
  }
  
  // Single, consistent export
  module.exports.handler = handler;
} catch (error) {
  console.error('Error setting up catalog handler:', error);
  
  // Fallback to Express handler if there's an error
  module.exports.handler = serverless(app);
} 