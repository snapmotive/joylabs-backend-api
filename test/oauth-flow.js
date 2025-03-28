const axios = require('axios');
const crypto = require('crypto');

// Use environment variable with fallback
const API_URL = process.env.API_URL || 'http://localhost:3000';
const APP_ID = process.env.SQUARE_APP_ID || 'sq0idp-WFTYv3An7NPv6ovGFLld1Q';

async function testOAuthFlow() {
  try {
    console.log('🔄 Testing Square OAuth Flow with Expo AuthSession');
    console.log(`Using API URL: ${API_URL}`);
    
    // Step 1: Initialize OAuth
    console.log('\n1. Initializing OAuth...');
    const initResponse = await axios.get(`${API_URL}/api/auth/square/mobile-init`, {
      validateStatus: null // Allow any status code for debugging
    });
    
    // Log detailed response information
    console.log('Response Status:', initResponse.status);
    console.log('Response Headers:', JSON.stringify(initResponse.headers, null, 2));
    
    if (initResponse.status !== 200) {
      throw new Error(`Failed to initialize OAuth. Status: ${initResponse.status}, Data: ${JSON.stringify(initResponse.data)}`);
    }
    
    const { url, state } = initResponse.data;
    
    console.log('✅ OAuth URL generated:', url);
    console.log('✅ State parameter:', state);
    
    // Step 2: Simulate user authorization (manual step)
    console.log('\n2. User Authorization:');
    console.log('⚠️ Manual step required:');
    console.log('1. Open this URL in a browser:', url);
    console.log('2. Complete Square authorization');
    console.log('3. Note the authorization code from the callback URL');
    
    // Step 3: Simulate callback (requires manual input)
    console.log('\n3. Callback Simulation:');
    console.log('⚠️ After authorization, test the callback with:');
    console.log(`curl "${API_URL}/api/auth/square/callback?code=YOUR_CODE&state=${state}"`);
    
  } catch (error) {
    console.error('❌ Error testing OAuth flow:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response Status:', error.response.status);
      console.error('Response Headers:', error.response.headers);
      console.error('Response Data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error:', error.message);
    }
    console.error('Error Config:', error.config);
  }
}

// Run the test
testOAuthFlow(); 