/**
 * Error Handling Utilities
 * Standardized error handling for API requests
 * Enhanced with Node.js 22 Error Cause support
 */

/**
 * Create an enhanced error with cause for better error tracking
 * This utilizes the Node.js 22 Error Cause feature
 * 
 * @param {string} message - Human-readable error message
 * @param {Error} cause - Original error that caused this error
 * @param {Object} additionalProps - Additional properties to add to the error
 * @returns {Error} Enhanced error object
 */
function createErrorWithCause(message, cause, additionalProps = {}) {
  // Create error with cause (Node.js 22 feature)
  const error = new Error(message, { cause });
  
  // Add additional properties
  if (additionalProps) {
    Object.assign(error, additionalProps);
  }
  
  return error;
}

/**
 * Safe JSON serialization that handles BigInt values by converting them to strings
 * @param {Object} data - The data to serialize
 * @returns {Object} - Safely serializable object
 */
function safeSerialize(data) {
  if (data === null || data === undefined) {
    return data;
  }
  
  try {
    // First convert to JSON string, handling BigInt, then parse back to object
    return JSON.parse(JSON.stringify(data, (_, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));
  } catch (error) {
    console.error('Error in safeSerialize:', error);
    // If serialization fails, do a manual traversal
    if (typeof data === 'object') {
      const result = Array.isArray(data) ? [] : {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const value = data[key];
          if (typeof value === 'bigint') {
            result[key] = value.toString();
          } else if (typeof value === 'object' && value !== null) {
            result[key] = safeSerialize(value);
          } else {
            result[key] = value;
          }
        }
      }
      return result;
    }
    return data;
  }
}

/**
 * Handle Square API errors in a standardized way
 * Enhanced with Error Cause for better error tracking
 * 
 * @param {Object} error - Square API error object
 * @param {string} defaultMessage - Default error message
 * @returns {Object} Standardized error response
 */
function handleSquareError(error, defaultMessage = 'An error occurred') {
  console.error('Square API Error:', error);
  
  // Extract cause if available (Node.js 22 feature)
  const originalError = error.cause || error;
  
  // Default error response
  const errorResponse = {
    success: false,
    error: {
      message: defaultMessage,
      code: 'UNKNOWN_ERROR',
      details: []
    }
  };
  
  // Check if it's a SquareError from the SDK
  if (originalError.name === 'SquareError') {
    errorResponse.error.message = originalError.message;
    errorResponse.error.code = originalError.code || 'SQUARE_SDK_ERROR';
    errorResponse.error.details = originalError.errors || [];
    if (originalError.statusCode) {
      errorResponse.statusCode = originalError.statusCode;
    }
    return errorResponse;
  }
  
  // Check if it's a Square API error with errors array
  if (originalError.errors && Array.isArray(originalError.errors)) {
    errorResponse.error.details = originalError.errors.map(e => ({
      code: e.code || 'UNKNOWN_ERROR',
      detail: e.detail || e.message || 'Unknown error',
      field: e.field || null
    }));
    
    // Use the first error's message if available
    if (originalError.errors[0]?.detail) {
      errorResponse.error.message = originalError.errors[0].detail;
    }
    
    // Use the first error's code if available
    if (originalError.errors[0]?.code) {
      errorResponse.error.code = originalError.errors[0].code;
    }
  } else if (originalError.response?.data?.errors) {
    // Handle Axios-wrapped Square errors
    const squareErrors = originalError.response.data.errors;
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
  } else if (originalError.details) {
    // Handle enhanced errors from our retry mechanism
    errorResponse.error.details = originalError.details;
    errorResponse.error.message = originalError.message;
    errorResponse.error.code = originalError.code || 'UNKNOWN_ERROR';
  } else if (originalError.message) {
    // Handle standard Error objects
    errorResponse.error.message = originalError.message;
    
    // Use the error code if available
    if (originalError.code) {
      errorResponse.error.code = originalError.code;
    } else {
      // Otherwise infer from message
      if (originalError.message.includes('Authentication') || originalError.message.includes('Unauthorized')) {
        errorResponse.error.code = 'AUTHENTICATION_ERROR';
      } else if (originalError.message.includes('Rate limit')) {
        errorResponse.error.code = 'RATE_LIMIT_ERROR';
      } else if (originalError.message.includes('Timeout')) {
        errorResponse.error.code = 'TIMEOUT_ERROR';
      } else if (originalError.message.includes('Network')) {
        errorResponse.error.code = 'NETWORK_ERROR';
      }
    }
  }

  // Include retry information if available
  if (originalError.retries !== undefined) {
    errorResponse.error.retries = originalError.retries;
    if (originalError.retries > 0) {
      errorResponse.error.message += ` (after ${originalError.retries} retries)`;
    }
  }

  // Map HTTP status code to error code
  if (originalError.statusCode || originalError.response?.status) {
    const statusCode = originalError.statusCode || originalError.response?.status;
    
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
        if (originalError.response?.headers?.['retry-after']) {
          errorResponse.error.retryAfter = parseInt(originalError.response.headers['retry-after'], 10);
        }
        break;
      case 400:
        if (originalError.code === 'INVALID_REQUEST_ERROR' || originalError.message.includes('validation')) {
          errorResponse.error.code = 'VALIDATION_ERROR';
          errorResponse.error.message = 'Invalid request: ' + originalError.message;
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
    // Ensure BigInt values are properly serialized
    const safeData = safeSerialize(data);
    Object.assign(response, safeData);
    if (message) {
      response.message = message;
    }
  } else if (!success) {
    // For error responses, include error details
    response.error = {
      message: message || 'An error occurred',
      code: data?.code || 'UNKNOWN_ERROR',
      details: safeSerialize(data?.details) || []
    };
  }
  
  return response;
}

module.exports = {
  handleSquareError,
  createApiResponse,
  safeSerialize,
  createErrorWithCause
}; 