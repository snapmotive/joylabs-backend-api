/**
 * Square API Helper Utilities
 * 
 * Contains functions for improved error handling, retry logic, and rate limiting
 * based on Square best practices.
 */
const { SquareError } = require('square');
const rateLimiter = require('./apiRateLimiter');

// Default retry configuration based on Square recommendations
const DEFAULT_RETRY_CONFIG = {
  numberOfRetries: 3,              // How many times to retry a request
  backoffFactor: 2,                // Exponential backoff factor (doubles wait time)
  retryInterval: 1000,             // Initial wait time in ms (1 second)
  maxRetryWaitTime: 60000,         // Maximum wait time between retries (60 seconds)
  statusCodesToRetry: [429, 500, 503] // Square API status codes to retry
};

/**
 * Execute a Square API request with automatic retries and exponential backoff
 * 
 * @param {Function} requestFn - Function that takes a Square client and returns a promise
 * @param {Object} client - Square client instance
 * @param {Object} options - Optional configuration for retries
 * @param {boolean} options.useRateLimiter - Whether to use rate limiting
 * @param {string} options.endpoint - Endpoint identifier for rate limiting
 * @param {number} options.cost - Cost of the request in rate limiting tokens
 * @returns {Promise<Object>} - Square API response
 */
async function executeWithRetry(requestFn, client, options = {}) {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    useRateLimiter: true,
    endpoint: 'square-api',
    cost: 1,
    ...options
  };
  
  let retries = 0;
  let lastError = null;
  let waitTime = config.retryInterval;
  
  // Apply rate limiting if enabled
  if (config.useRateLimiter) {
    await rateLimiter.acquire(config.endpoint, config.cost);
  }
  
  while (retries <= config.numberOfRetries) {
    try {
      // If this isn't the first attempt, log that we're retrying
      if (retries > 0) {
        console.log(`Retry attempt ${retries}/${config.numberOfRetries} after ${waitTime}ms`);
      }
      
      // Execute the request function with the Square client
      return await requestFn(client);
    } catch (error) {
      lastError = error;
      
      // Determine if we should retry based on the error type
      const shouldRetry = shouldRetryRequest(error, config);
      
      if (!shouldRetry || retries >= config.numberOfRetries) {
        // Log the final error with details
        logApiError(error, retries);
        throw enhanceError(error);
      }
      
      // Calculate wait time for next retry with exponential backoff
      waitTime = calculateBackoff(retries, error, config);
      
      // Log the error and that we're going to retry
      console.warn(`Square API error (will retry): ${error.message}`, {
        statusCode: error.statusCode || error.response?.status,
        retryAttempt: retries + 1,
        waitTime
      });
      
      // Wait before next retry
      await sleep(waitTime);
      
      // Increment retry counter
      retries++;
      
      // Check rate limiter before retry if enabled
      if (config.useRateLimiter) {
        await rateLimiter.acquire(config.endpoint, config.cost);
      }
    }
  }
  
  // We should never reach here due to the throw in the catch block
  // But just in case, throw the last error
  throw lastError;
}

/**
 * Configure rate limiting for specific Square API endpoints
 * This should be called early in application initialization
 */
function configureRateLimits() {
  // Configure rate limits for different endpoint categories
  // based on Square's documented limits
  
  // Catalog API has a limit of 20 requests per second
  rateLimiter.configureBucket('catalog-api', {
    tokensPerInterval: 15,  // Be conservative
    intervalMs: 1000,       // 1 second
    bucketSize: 30
  });
  
  // Customers API has a limit of 20 requests per second
  rateLimiter.configureBucket('customers-api', {
    tokensPerInterval: 15, 
    intervalMs: 1000,
    bucketSize: 30
  });
  
  // Orders API has a limit of 15 requests per second
  rateLimiter.configureBucket('orders-api', {
    tokensPerInterval: 10,  // Be conservative
    intervalMs: 1000,
    bucketSize: 25
  });
  
  // OAuth token endpoints are more restrictive
  rateLimiter.configureBucket('oauth-api', {
    tokensPerInterval: 5,
    intervalMs: 1000,
    bucketSize: 10
  });
  
  // Default bucket for other APIs
  rateLimiter.configureBucket('square-api', {
    tokensPerInterval: 10,
    intervalMs: 1000,
    bucketSize: 20
  });
}

/**
 * Determine if a request should be retried based on the error type
 * 
 * @param {Error} error - The error from a Square API request
 * @param {Object} config - Retry configuration
 * @returns {boolean} - Whether the request should be retried
 */
function shouldRetryRequest(error, config) {
  // Get status code from different possible locations
  const statusCode = error.statusCode || error.response?.status;
  
  // Check if it's a rate limit error (429)
  if (statusCode === 429) {
    return true;
  }
  
  // Check if it's another retriable status code
  if (config.statusCodesToRetry.includes(statusCode)) {
    return true;
  }
  
  // Check for network errors which may be transient
  if (error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNREFUSED' ||
      error.message.includes('network') ||
      error.message.includes('timeout')) {
    return true;
  }
  
  // Don't retry other types of errors
  return false;
}

/**
 * Calculate the backoff time for a retry
 * 
 * @param {number} retryCount - The current retry count
 * @param {Error} error - The error from a Square API request
 * @param {Object} config - Retry configuration
 * @returns {number} - The wait time in milliseconds
 */
function calculateBackoff(retryCount, error, config) {
  // Start with the base retry interval
  let waitTime = config.retryInterval;
  
  // Apply exponential backoff
  waitTime = waitTime * Math.pow(config.backoffFactor, retryCount);
  
  // If it's a rate limit error with a Retry-After header, use that value
  if (error.statusCode === 429 && error.response?.headers?.['retry-after']) {
    const retryAfterSec = parseInt(error.response.headers['retry-after'], 10);
    if (!isNaN(retryAfterSec)) {
      const retryAfterMs = retryAfterSec * 1000;
      // Use the greater of the calculated backoff or the Retry-After header
      waitTime = Math.max(waitTime, retryAfterMs);
    }
  }
  
  // Ensure we don't exceed the maximum wait time
  return Math.min(waitTime, config.maxRetryWaitTime);
}

/**
 * Enhance error object with additional context
 * 
 * @param {Error} error - The error from a Square API request
 * @returns {Error} - Enhanced error with additional properties
 */
function enhanceError(error) {
  // If it's already a properly formed error with statusCode, no need to modify it
  if (error.statusCode) {
    return error;
  }
  
  // Add statusCode from response if available
  if (error.response && error.response.status) {
    error.statusCode = error.response.status;
  } else {
    // Default status code for unknown errors
    error.statusCode = 500;
  }
  
  // Add error code if missing
  if (!error.code) {
    if (error.statusCode === 429) {
      error.code = 'RATE_LIMIT_ERROR';
    } else if (error.statusCode === 401 || error.statusCode === 403) {
      error.code = 'AUTHENTICATION_ERROR';
    } else if (error.statusCode === 404) {
      error.code = 'NOT_FOUND_ERROR';
    } else if (error.statusCode >= 500) {
      error.code = 'SERVER_ERROR';
    } else {
      error.code = 'UNKNOWN_ERROR';
    }
  }
  
  return error;
}

/**
 * Log details about a Square API error
 * 
 * @param {Error} error - The error from a Square API request
 * @param {number} retries - Number of retries attempted
 */
function logApiError(error, retries) {
  console.error('Square API error:', {
    message: error.message,
    code: error.code || error.statusCode || 'UNKNOWN_ERROR',
    statusCode: error.statusCode || error.response?.status || 500,
    details: error.details || error.errors || [],
    retries: retries || 0
  });
}

/**
 * Helper to create a delay
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize rate limiting configuration
configureRateLimits();

module.exports = {
  executeWithRetry,
  shouldRetryRequest,
  calculateBackoff,
  enhanceError,
  logApiError,
  DEFAULT_RETRY_CONFIG,
  configureRateLimits
}; 