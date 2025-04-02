/**
 * Test script for security improvements in Node.js 22
 * Tests WebCrypto API, Error Cause, and Native Fetch API
 */

// Import required modules
const { 
  generateCodeVerifier, 
  generateCodeChallenge,
  getMerchantInfoWithFetch
} = require('../src/services/square');
const webCrypto = require('../src/utils/webCrypto');
const fetchHelpers = require('../src/utils/fetchHelpers');
const { createErrorWithCause } = require('../src/utils/errorHandling');

// Test WebCrypto API implementation
async function testWebCrypto() {
  console.log('\n--- Testing WebCrypto API ---');
  
  try {
    // Test async code verifier generation
    console.log('Generating code verifier...');
    const verifier = await generateCodeVerifier();
    console.log(`Code verifier (first 10 chars): ${verifier.substring(0, 10)}...`);
    console.log(`Length: ${verifier.length} chars`);
    
    // Test code challenge generation
    console.log('\nGenerating code challenge from verifier...');
    const challenge = await generateCodeChallenge(verifier);
    console.log(`Code challenge (first 10 chars): ${challenge.substring(0, 10)}...`);
    console.log(`Length: ${challenge.length} chars`);
    
    // Test direct WebCrypto methods
    console.log('\nTesting direct WebCrypto methods...');
    const verifierDirect = await webCrypto.generateCodeVerifier();
    const challengeDirect = await webCrypto.generateCodeChallenge(verifierDirect);
    console.log(`Direct generation successful: ${verifierDirect.length} / ${challengeDirect.length} chars`);
    
    // Test legacy methods for compatibility
    console.log('\nTesting legacy methods...');
    const verifierLegacy = webCrypto.generateCodeVerifierLegacy();
    const challengeLegacy = webCrypto.generateCodeChallengeLegacy(verifierLegacy);
    console.log(`Legacy generation successful: ${verifierLegacy.length} / ${challengeLegacy.length} chars`);
    
    console.log('\n✅ WebCrypto API tests passed');
    return true;
  } catch (error) {
    console.error('\n❌ WebCrypto API tests failed:', error);
    return false;
  }
}

// Test Error Cause implementation
async function testErrorCause() {
  console.log('\n--- Testing Error Cause ---');
  
  try {
    // Create a simple error
    const originalError = new Error('Original error message');
    originalError.code = 'ORIGINAL_ERROR';
    
    // Create an enhanced error with cause
    console.log('Creating error with cause...');
    const enhancedError = createErrorWithCause(
      'Enhanced error message',
      originalError,
      { statusCode: 400, additionalInfo: 'Some additional context' }
    );
    
    // Check properties
    console.log(`Enhanced error message: ${enhancedError.message}`);
    console.log(`Original error (cause) message: ${enhancedError.cause.message}`);
    console.log(`Additional properties: statusCode=${enhancedError.statusCode}, additionalInfo=${enhancedError.additionalInfo}`);
    
    // Test error chaining
    console.log('\nTesting error chaining...');
    try {
      throw enhancedError;
    } catch (error) {
      console.log(`Caught error: ${error.message}`);
      console.log(`Access to cause: ${error.cause.message}`);
      console.log(`Chain is preserved: ${error.cause.code === 'ORIGINAL_ERROR'}`);
    }
    
    console.log('\n✅ Error Cause tests passed');
    return true;
  } catch (error) {
    console.error('\n❌ Error Cause tests failed:', error);
    return false;
  }
}

// Test Native Fetch API implementation
async function testNativeFetch() {
  console.log('\n--- Testing Native Fetch API ---');
  
  try {
    // Test basic fetch (public API)
    console.log('Testing basic fetch...');
    const response = await fetchHelpers.fetchJson('https://httpbin.org/json');
    console.log(`Fetch successful: ${response.slideshow.title}`);
    
    // Test fetch with timeout
    console.log('\nTesting fetch with timeout...');
    try {
      // This should timeout (1ms is too short)
      await fetchHelpers.fetchWithTimeout('https://httpbin.org/delay/1', {}, 1);
      console.log('❌ Timeout test failed - should have timed out');
    } catch (error) {
      console.log(`✅ Timeout correctly triggered: ${error.message}`);
      console.log(`Error has proper code: ${error.code === 'TIMEOUT_ERROR'}`);
    }
    
    // Test post JSON
    console.log('\nTesting POST JSON...');
    const postResponse = await fetchHelpers.postJson(
      'https://httpbin.org/post', 
      { test: 'data', num: 123 }
    );
    console.log(`POST successful, echoed data: ${JSON.stringify(postResponse.json)}`);
    
    console.log('\n✅ Native Fetch API tests passed');
    return true;
  } catch (error) {
    console.error('\n❌ Native Fetch API tests failed:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('==============================');
  console.log('TESTING SECURITY IMPROVEMENTS');
  console.log('==============================');
  
  let success = true;
  
  success = await testWebCrypto() && success;
  success = await testErrorCause() && success;
  success = await testNativeFetch() && success;
  
  console.log('\n==============================');
  if (success) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('==============================');
}

// Execute tests
runAllTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
}); 