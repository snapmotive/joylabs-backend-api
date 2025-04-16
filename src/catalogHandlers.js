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
const axios = require('axios');

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
  const endpointPath = '/v2/catalog/categories (using list?types=CATEGORY)';
  console.log(`[REQUEST] ${endpointPath} endpoint accessed`);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;
    const squareUrl = 'https://connect.squareup.com/v2/catalog/list';
    const { cursor, limit = 200 } = req.query; // Allow pagination

    const outgoingHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': squareService.SQUARE_API_HEADER_VERSION,
    };

    console.log(`[DEBUG] Catalog Handler - Outgoing Axios Request to Square ${endpointPath}`, {
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: { types: 'CATEGORY', limit: parseInt(limit), cursor },
      tokenPreview: token
        ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        : 'null',
    });

    const response = await axios({
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: { types: 'CATEGORY', limit: parseInt(limit), cursor },
    });

    console.log(`[${endpointPath}] Square API call successful.`);
    const enrichedResult = {
      success: true,
      categories: response.data.objects || [], // Rename for clarity
      cursor: response.data.cursor,
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'ListCatalog (Categories)',
      },
    };
    const safeResult = safeSerialize(enrichedResult);
    return res.status(response.status || 200).json(safeResult);
  } catch (error) {
    console.error(`Error in ${endpointPath} endpoint:`, error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    const errorResponse = safeSerialize({
      success: false,
      message:
        error.response?.data?.errors?.[0]?.detail || error.message || 'Internal server error',
      errors: error.response?.data?.errors || [{ code: 'UNKNOWN_ERROR', detail: error.message }],
    });
    return res.status(statusCode).json(errorResponse);
  }
});

// NEW ENDPOINT: List all categories using the simpler ListCatalog endpoint
app.get('/v2/catalog/list-categories', protect, async (req, res) => {
  const endpointPath = '/v2/catalog/list-categories (using list?types=CATEGORY)';
  console.log(`[REQUEST] ${endpointPath} endpoint accessed`);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;
    const squareUrl = 'https://connect.squareup.com/v2/catalog/list';
    const { cursor, limit = 200 } = req.query;

    const outgoingHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': squareService.SQUARE_API_HEADER_VERSION,
    };

    console.log(`[DEBUG] Catalog Handler - Outgoing Axios Request to Square ${endpointPath}`, {
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: { types: 'CATEGORY', limit: parseInt(limit), cursor },
      tokenPreview: token
        ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        : 'null',
    });

    const response = await axios({
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: { types: 'CATEGORY', limit: parseInt(limit), cursor },
    });

    console.log(`[${endpointPath}] Square API call successful.`);
    const enrichedResult = {
      success: true,
      categories: response.data.objects || [], // Rename for consistency
      cursor: response.data.cursor,
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'ListCatalog (List Categories)',
      },
    };
    const safeResult = safeSerialize(enrichedResult);
    return res.status(response.status || 200).json(safeResult);
  } catch (error) {
    console.error(`Error in ${endpointPath} endpoint:`, error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    const errorResponse = safeSerialize({
      success: false,
      message:
        error.response?.data?.errors?.[0]?.detail || error.message || 'Internal server error',
      errors: error.response?.data?.errors || [{ code: 'UNKNOWN_ERROR', detail: error.message }],
    });
    return res.status(statusCode).json(errorResponse);
  }
});

// Handle the root handler for the /v2/catalog/list route
app.get('/v2/catalog/list', protect, async (req, res) => {
  const endpointPath = '/v2/catalog/list';
  console.log(`[REQUEST] ${endpointPath} endpoint accessed`);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;
    const { types = 'ITEM', limit = 1000, cursor } = req.query;
    const squareUrl = 'https://connect.squareup.com/v2/catalog/list';

    const outgoingHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': squareService.SQUARE_API_HEADER_VERSION,
    };

    const params = {
      types: Array.isArray(types) ? types.join(',') : types,
      limit: parseInt(limit),
      ...(cursor && { cursor }), // Conditionally add cursor if it exists
    };

    console.log(`[DEBUG] Catalog Handler - Outgoing Axios Request to Square ${endpointPath}`, {
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: params,
      tokenPreview: token
        ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        : 'null',
    });

    const response = await axios({
      method: 'get',
      url: squareUrl,
      headers: outgoingHeaders,
      params: params,
    });

    console.log(`[${endpointPath}] Square API call successful.`);
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
    const safeResult = safeSerialize(enrichedResult);
    return res.status(response.status || 200).json(safeResult);
  } catch (error) {
    console.error(`Error in ${endpointPath} endpoint:`, error.response?.data || error.message);
    const statusCode = error.response?.status || 500;
    const errorResponse = safeSerialize({
      success: false,
      message:
        error.response?.data?.errors?.[0]?.detail || error.message || 'Internal server error',
      errors: error.response?.data?.errors || [{ code: 'UNKNOWN_ERROR', detail: error.message }],
    });
    return res.status(statusCode).json(errorResponse);
  }
});

// *** ADDED: Direct handler for POST /v2/catalog/object (Upsert) ***
app.post('/v2/catalog/object', protect, async (req, res) => {
  const endpointPath = '/v2/catalog/object';
  console.log(`[REQUEST] ${endpointPath} endpoint accessed`);
  console.log('[REQUEST] User info:', {
    merchantId: req.user.merchantId,
    businessName: req.user.businessName || 'Unknown',
  });

  try {
    const token = req.user.squareAccessToken;
    const requestBody = req.body; // Contains idempotency_key and object

    // Validate required fields from request body
    if (!requestBody || !requestBody.idempotency_key || !requestBody.object) {
      console.error('Error in upsert endpoint: Missing idempotency_key or object in request body');
      return res.status(400).json(
        safeSerialize({
          success: false,
          message: 'Request body must include idempotency_key and object fields.',
        })
      );
    }

    // Use axios for direct API call
    const squareUrl = 'https://connect.squareup.com/v2/catalog/object';

    const outgoingHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': squareService.SQUARE_API_HEADER_VERSION,
    };

    console.log(`[DEBUG] Catalog Handler - Outgoing Axios Request to Square ${endpointPath}`, {
      method: 'post',
      url: squareUrl,
      headers: outgoingHeaders,
      tokenPreview: token
        ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        : 'null',
      data: requestBody, // Log the data being sent
    });

    // Make the POST request
    const response = await axios({
      method: 'post',
      url: squareUrl,
      headers: outgoingHeaders,
      data: requestBody,
    });

    console.log(`[${endpointPath}] Square API call successful.`);

    // Format and return the successful response from Square
    const enrichedResult = {
      success: true,
      data: response.data, // Send back the raw Square response data
      metadata: {
        merchantId: req.user.merchantId,
        timestamp: new Date().toISOString(),
        requestPath: req.path,
        method: 'UpsertCatalogObject',
      },
    };

    const safeResult = safeSerialize(enrichedResult);
    return res.status(response.status || 200).json(safeResult);
  } catch (error) {
    console.error(`Error in ${endpointPath} endpoint:`, error.response?.data || error.message);
    // Handle and serialize error response
    const statusCode = error.response?.status || 500;
    const errorResponse = safeSerialize({
      success: false,
      message:
        error.response?.data?.errors?.[0]?.detail || error.message || 'Internal server error',
      errors: error.response?.data?.errors || [{ code: 'UNKNOWN_ERROR', detail: error.message }],
    });
    return res.status(statusCode).json(errorResponse);
  }
});
// *** END ADDED HANDLER ***

// Mount catalog routes with v2 format only
// app.use('/v2/catalog', catalogRoutes);

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

// Add a catch-all handler for Express routes not matched above
app.use('*', (req, res) => {
  console.log('Catch-all Express route handler - Path not found:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
  });

  res.status(404).json(
    safeSerialize({
      success: false,
      error: 'Catalog route not found',
      requestedPath: req.originalUrl,
    })
  );
});

// Delete conflicting exports to clean up
if (exports.handler) {
  delete exports.handler;
}

// Correctly export the Express app handler using serverless-http
module.exports.handler = serverless(app);
