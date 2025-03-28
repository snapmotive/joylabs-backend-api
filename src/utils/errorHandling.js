/**
 * Error Handling Utilities
 * Standardized error handling for API requests
 */

/**
 * Handle Square API errors in a standardized way
 * @param {Object} error - Square API error object
 * @param {string} defaultMessage - Default error message
 * @returns {Object} Standardized error response
 */
function handleSquareError(error, defaultMessage = 'An error occurred') {
  console.error('Square API Error:', error);
  
  // Default error response
  const errorResponse = {
    success: false,
    error: {
      message: defaultMessage,
      code: 'UNKNOWN_ERROR',
      details: []
    }
  };
  
  // Check if it's a Square API error
  if (error.errors && Array.isArray(error.errors)) {
    errorResponse.error.details = error.errors.map(e => ({
      code: e.code || 'UNKNOWN_ERROR',
      detail: e.detail || e.message || 'Unknown error',
      field: e.field || null
    }));
    
    // Use the first error's message if available
    if (error.errors[0]?.detail) {
      errorResponse.error.message = error.errors[0].detail;
    }
    
    // Use the first error's code if available
    if (error.errors[0]?.code) {
      errorResponse.error.code = error.errors[0].code;
    }
  } else if (error.response?.data?.errors) {
    // Handle Axios-wrapped Square errors
    const squareErrors = error.response.data.errors;
    errorResponse.error.details = squareErrors.map(e => ({
      code: e.code || 'UNKNOWN_ERROR',
      detail: e.detail || e.message || 'Unknown error',
      field: e.field || null
    }));
    
    if (squareErrors[0]?.detail) {
      errorResponse.error.message = squareErrors[0].detail;
    }
    
    if (squareErrors[0]?.code) {
      errorResponse.error.code = squareErrors[0].code;
    }
  } else if (error.message) {
    // Handle standard Error objects
    errorResponse.error.message = error.message;
    
    // Check for authentication errors
    if (error.message.includes('Authentication') || error.message.includes('Unauthorized')) {
      errorResponse.error.code = 'AUTHENTICATION_ERROR';
    } else if (error.message.includes('Rate limit')) {
      errorResponse.error.code = 'RATE_LIMIT_ERROR';
    }
  }

  // Map HTTP status code to error code
  if (error.status || error.response?.status) {
    const statusCode = error.status || error.response?.status;
    
    // Add status code to response
    errorResponse.statusCode = statusCode;
    
    // Set appropriate error code based on status
    switch (statusCode) {
      case 401:
        errorResponse.error.code = 'AUTHENTICATION_ERROR';
        errorResponse.error.message = 'Authentication failed. Please reconnect your Square account.';
        break;
      case 403:
        errorResponse.error.code = 'PERMISSION_ERROR';
        errorResponse.error.message = 'You do not have permission to perform this action.';
        break;
      case 404:
        errorResponse.error.code = 'NOT_FOUND';
        errorResponse.error.message = 'The requested resource was not found.';
        break;
      case 429:
        errorResponse.error.code = 'RATE_LIMIT_ERROR';
        errorResponse.error.message = 'Rate limit exceeded. Please try again later.';
        // Add retry-after if available
        if (error.response?.headers?.['retry-after']) {
          errorResponse.error.retryAfter = parseInt(error.response.headers['retry-after'], 10);
        }
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorResponse.error.code = 'SERVER_ERROR';
        errorResponse.error.message = 'Square API is currently unavailable. Please try again later.';
        break;
    }
  }
  
  return errorResponse;
}

/**
 * Create a standardized API response
 * @param {boolean} success - Whether the operation was successful
 * @param {Object} data - Response data
 * @param {string} message - Success or error message
 * @returns {Object} Standardized API response
 */
function createApiResponse(success, data = null, message = null) {
  const response = { success };
  
  if (success && data) {
    // For success responses, include data directly in the response
    Object.assign(response, data);
    if (message) {
      response.message = message;
    }
  } else if (!success) {
    // For error responses, include error details
    response.error = {
      message: message || 'An error occurred',
      code: data?.code || 'UNKNOWN_ERROR',
      details: data?.details || []
    };
  }
  
  return response;
}

module.exports = {
  handleSquareError,
  createApiResponse
}; 