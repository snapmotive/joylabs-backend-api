/**
 * Modern Fetch API Helpers for Node.js 22
 * Provides secure fetch helpers with enhanced error handling and timeout support
 */

const { createErrorWithCause } = require('./errorHandling');

/**
 * Enhanced fetch wrapper with timeout and error handling
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  try {
    // Create an AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Add signal to options
    const fetchOptions = {
      ...options,
      signal: controller.signal,
    };

    // Execute fetch
    const response = await fetch(url, fetchOptions);

    // Clear timeout
    clearTimeout(timeoutId);

    // Check for error responses
    if (!response.ok) {
      // Parse error response if possible
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: `HTTP Error ${response.status}` };
      }

      // Create error with HTTP status
      const error = createErrorWithCause(
        errorData.message || `HTTP Error ${response.status}`,
        new Error(`HTTP ${response.status}`),
        {
          statusCode: response.status,
          url,
          data: errorData,
        }
      );

      throw error;
    }

    return response;
  } catch (error) {
    // Handle abort error (timeout)
    if (error.name === 'AbortError') {
      throw createErrorWithCause(`Request timeout after ${timeoutMs}ms`, error, {
        code: 'TIMEOUT_ERROR',
        statusCode: 408,
        url,
      });
    }

    // Rethrow with enhanced information
    throw createErrorWithCause(`Fetch error: ${error.message}`, error, {
      code: 'FETCH_ERROR',
      url,
    });
  }
}

/**
 * JSON fetch - fetches and parses JSON in one call
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  return response.json();
}

/**
 * POST JSON data with proper headers
 *
 * @param {string} url - URL to post to
 * @param {Object} data - JSON data to post
 * @param {Object} options - Additional fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function postJson(url, data, options = {}, timeoutMs = 5000) {
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(data),
    ...options,
  };

  return fetchJson(url, fetchOptions, timeoutMs);
}

module.exports = {
  fetchWithTimeout,
  fetchJson,
  postJson,
};
