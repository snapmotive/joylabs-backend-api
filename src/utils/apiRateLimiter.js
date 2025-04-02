/**
 * API Rate Limiter
 *
 * Implements a token bucket algorithm for rate limiting Square API requests
 * to proactively avoid hitting rate limits.
 */

// Token bucket configuration based on Square's limits
// https://developer.squareup.com/docs/build-basics/rate-limiting
const DEFAULT_BUCKET_CONFIG = {
  tokensPerInterval: 20, // Default tokens per interval (conservative)
  intervalMs: 1000, // 1 second
  bucketSize: 30, // Maximum tokens that can accumulate
};

// Store for different buckets (one per endpoint or category)
const buckets = new Map();

/**
 * TokenBucket implementation for rate limiting
 */
class TokenBucket {
  constructor(config = {}) {
    this.tokens = config.bucketSize || DEFAULT_BUCKET_CONFIG.bucketSize;
    this.tokensPerInterval = config.tokensPerInterval || DEFAULT_BUCKET_CONFIG.tokensPerInterval;
    this.intervalMs = config.intervalMs || DEFAULT_BUCKET_CONFIG.intervalMs;
    this.bucketSize = config.bucketSize || DEFAULT_BUCKET_CONFIG.bucketSize;
    this.lastRefillTimestamp = Date.now();
  }

  /**
   * Refill the bucket based on elapsed time
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTimestamp;

    if (elapsedMs > 0) {
      // Calculate how many tokens to add based on elapsed time
      const newTokens = (elapsedMs / this.intervalMs) * this.tokensPerInterval;

      // Add tokens, but don't exceed bucket size
      this.tokens = Math.min(this.bucketSize, this.tokens + newTokens);
      this.lastRefillTimestamp = now;
    }
  }

  /**
   * Try to consume tokens
   * @param {number} count - Number of tokens to consume (default: 1)
   * @returns {boolean} - Whether tokens were successfully consumed
   */
  tryConsume(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Calculate wait time until enough tokens are available
   * @param {number} count - Number of tokens needed
   * @returns {number} - Estimated wait time in milliseconds
   */
  getWaitTimeMs(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      return 0;
    }

    // Calculate how many more tokens we need
    const tokensNeeded = count - this.tokens;

    // Calculate how long it will take to get those tokens
    return (tokensNeeded / this.tokensPerInterval) * this.intervalMs;
  }
}

/**
 * Get or create a token bucket for an endpoint
 * @param {string} endpoint - Endpoint identifier
 * @param {Object} config - Optional configuration overrides
 * @returns {TokenBucket} - The token bucket
 */
function getBucket(endpoint, config = {}) {
  if (!buckets.has(endpoint)) {
    buckets.set(
      endpoint,
      new TokenBucket({
        ...DEFAULT_BUCKET_CONFIG,
        ...config,
      })
    );
  }

  return buckets.get(endpoint);
}

/**
 * Try to acquire permission to make an API request
 * @param {string} endpoint - Endpoint identifier
 * @param {number} cost - Cost of the request in tokens (default: 1)
 * @returns {boolean} - Whether the request is allowed
 */
function tryAcquire(endpoint, cost = 1) {
  const bucket = getBucket(endpoint);
  return bucket.tryConsume(cost);
}

/**
 * Wait until a request can be made
 * @param {string} endpoint - Endpoint identifier
 * @param {number} cost - Cost of the request in tokens (default: 1)
 * @returns {Promise<void>} - Promise that resolves when the request can be made
 */
async function acquire(endpoint, cost = 1) {
  const bucket = getBucket(endpoint);

  if (bucket.tryConsume(cost)) {
    return;
  }

  // Wait for the required time
  const waitTimeMs = bucket.getWaitTimeMs(cost);

  if (waitTimeMs > 0) {
    console.log(`Rate limiting: Waiting ${waitTimeMs}ms before making request to ${endpoint}`);
    await new Promise(resolve => setTimeout(resolve, waitTimeMs));

    // Consume tokens after waiting
    bucket.tryConsume(cost);
  }
}

/**
 * Wrap a function with rate limiting
 * @param {Function} fn - Function to wrap
 * @param {string} endpoint - Endpoint identifier
 * @param {number} cost - Cost of the request in tokens (default: 1)
 * @returns {Function} - Rate-limited function
 */
function rateLimit(fn, endpoint, cost = 1) {
  return async (...args) => {
    await acquire(endpoint, cost);
    return fn(...args);
  };
}

/**
 * Configure a specific bucket
 * @param {string} endpoint - Endpoint identifier
 * @param {Object} config - Configuration
 */
function configureBucket(endpoint, config) {
  buckets.set(
    endpoint,
    new TokenBucket({
      ...DEFAULT_BUCKET_CONFIG,
      ...config,
    })
  );
}

// Export the API
module.exports = {
  tryAcquire,
  acquire,
  rateLimit,
  configureBucket,
  DEFAULT_BUCKET_CONFIG,
};
