/**
 * WebCrypto API utilities for secure cryptographic operations
 * Uses modern Web Crypto API for improved security in Node.js 22
 */

// Import Node.js crypto modules
const crypto = require('crypto');
const { webcrypto } = crypto;

/**
 * Generate a code verifier for PKCE
 * Must be between 43-128 chars, URL safe base64
 * @returns {string} A random code verifier
 */
async function generateCodeVerifier() {
  // Create a random array of 32 bytes (will result in 43 chars when base64url encoded)
  const array = new Uint8Array(32);
  webcrypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate a code challenge from a code verifier
 * @param {string} codeVerifier - The code verifier to hash
 * @returns {Promise<string>} The code challenge (base64url encoded SHA-256 hash)
 */
async function generateCodeChallenge(codeVerifier) {
  // Encode the verifier as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  
  // Hash using SHA-256
  const digest = await webcrypto.subtle.digest('SHA-256', data);
  
  // Convert to base64url
  return base64URLEncode(new Uint8Array(digest));
}

/**
 * Encode a buffer as URL-safe base64
 * @param {Uint8Array} buffer - The buffer to encode
 * @returns {string} URL-safe base64 string
 */
function base64URLEncode(buffer) {
  // Convert buffer to base64 (Node.js doesn't have btoa)
  const base64 = Buffer.from(buffer).toString('base64');
  
  // Make base64 URL-safe
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Legacy method to generate code verifier using Node.js crypto
 * @returns {string} A random code verifier
 */
function generateCodeVerifierLegacy() {
  const randomBytes = crypto.randomBytes(32);
  return base64URLEncodeLegacy(randomBytes);
}

/**
 * Legacy base64url encoding for Node.js Buffer
 * @param {Buffer} buffer - The buffer to encode
 * @returns {string} URL-safe base64 string
 */
function base64URLEncodeLegacy(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Legacy method to generate code challenge
 * @param {string} verifier - The code verifier
 * @returns {string} The code challenge
 */
function generateCodeChallengeLegacy(verifier) {
  const hash = crypto.createHash('sha256')
    .update(verifier)
    .digest();
  return base64URLEncodeLegacy(hash);
}

module.exports = {
  // Modern WebCrypto methods
  generateCodeVerifier,
  generateCodeChallenge,
  base64URLEncode,
  
  // Legacy compatibility methods
  generateCodeVerifierLegacy,
  generateCodeChallengeLegacy,
  base64URLEncodeLegacy
}; 