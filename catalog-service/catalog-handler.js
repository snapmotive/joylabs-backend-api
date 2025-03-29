/**
 * Ultra-minimal catalog handler
 * Directly proxies requests to Square API with minimal dependencies
 */
const axios = require('axios');

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json'
};

// Handle Square API requests
async function callSquareApi(path, method, token, data = null, queryParams = null) {
  try {
    // Build URL with query parameters if provided
    let url = `https://connect.squareup.com/v2${path}`;
    if (queryParams) {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const paramString = params.toString();
      if (paramString) {
        url += (url.includes('?') ? '&' : '?') + paramString;
      }
    }
    
    // Configure request
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'JoyLabs-Catalog-Service'
    };
    
    const config = {
      method,
      url,
      headers,
      ...(data ? { data } : {})
    };
    
    console.log(`Making ${method} request to ${url.split('?')[0]}`);
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Square API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    throw {
      statusCode: error.response?.status || 500,
      error: error.response?.data?.errors || [{ detail: error.message }]
    };
  }
}

// Verify token by checking merchant profile
async function verifyToken(token) {
  try {
    await callSquareApi('/merchants/me', 'GET', token);
    return true;
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'CORS preflight response' })
    };
  }

  try {
    // Extract authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          errors: [{ detail: 'Missing or invalid authorization header' }]
        })
      };
    }
    
    // Extract token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const isValidToken = await verifyToken(token);
    if (!isValidToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          errors: [{ detail: 'Invalid access token' }]
        })
      };
    }
    
    // Process the request based on path and method
    const path = event.path;
    const method = event.httpMethod;
    
    try {
      let squarePath, squareMethod, requestData, queryParams;
      
      // Map API Gateway path to Square API path
      if (path === '/v2/catalog/list' || path === '/api/catalog/list') {
        squarePath = '/catalog/list';
        squareMethod = 'GET';
        queryParams = event.queryStringParameters;
      } 
      else if (path.match(/\/v2\/catalog\/item\/[^/]+$/) || path.match(/\/api\/catalog\/item\/[^/]+$/)) {
        const id = path.split('/').pop();
        squarePath = `/catalog/object/${id}`;
        squareMethod = 'GET';
        queryParams = { include_related_objects: 'true' };
      } 
      else if (path === '/v2/catalog/search' || path === '/api/catalog/search') {
        squarePath = '/catalog/search';
        squareMethod = 'POST';
        requestData = JSON.parse(event.body || '{}');
      }
      else {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ 
            errors: [{ detail: 'Endpoint not found' }]
          })
        };
      }
      
      // Make request to Square API
      const result = await callSquareApi(
        squarePath, 
        squareMethod, 
        token, 
        requestData,
        queryParams
      );
      
      // Return successful response
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error) {
      // Return error from Square API
      return {
        statusCode: error.statusCode || 500,
        headers: corsHeaders,
        body: JSON.stringify({ errors: error.error })
      };
    }
  } catch (error) {
    // Handle unexpected errors
    console.error('Unhandled error in catalog handler:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        errors: [{ detail: 'Internal server error' }]
      })
    };
  }
}; 