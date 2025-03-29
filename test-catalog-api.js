const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.production' });

const API_BASE_URL = process.env.API_BASE_URL || 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production';

// Function to test the catalog API endpoints
async function testCatalogAPI() {
  try {
    // Get Square access token from command line argument
    const accessToken = process.argv[2];
    
    if (!accessToken) {
      console.error('Please provide a Square access token as the first argument');
      console.log('Usage: node test-catalog-api.js <ACCESS_TOKEN>');
      process.exit(1);
    }
    
    console.log('===========================================');
    console.log('Testing the JoyLabs Catalog API');
    console.log('===========================================');
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log(`Using access token: ${accessToken.substring(0, 5)}...${accessToken.substring(accessToken.length - 5)}`);
    console.log('===========================================\n');
    
    // Setup request headers
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    // Test 1: Base catalog endpoint
    console.log('\n[TEST 1] Testing base catalog endpoint');
    try {
      const baseResponse = await axios.get(`${API_BASE_URL}/v2/catalog`, { headers });
      console.log('✅ Base endpoint response:');
      console.log(JSON.stringify(baseResponse.data, null, 2));
    } catch (error) {
      console.error('❌ Error testing base endpoint:');
      logError(error);
    }
    
    // Test 2: List catalog items
    console.log('\n[TEST 2] Testing catalog/list endpoint');
    try {
      const listResponse = await axios.get(`${API_BASE_URL}/v2/catalog/list`, { headers });
      console.log('✅ List endpoint response:');
      if (listResponse.data.objects) {
        console.log(`Found ${listResponse.data.objects.length} catalog objects`);
        if (listResponse.data.objects.length > 0) {
          console.log('First item preview:');
          const item = listResponse.data.objects[0];
          console.log({
            id: item.id,
            type: item.type,
            name: item.itemData?.name || item.categoryData?.name || 'N/A',
            version: item.version
          });
        }
      } else {
        console.log('No catalog objects found');
      }
    } catch (error) {
      console.error('❌ Error testing list endpoint:');
      logError(error);
    }
    
    // Test 3: Search catalog (if list test passed)
    console.log('\n[TEST 3] Testing catalog/search endpoint');
    try {
      const searchRequest = {
        objectTypes: ["ITEM", "CATEGORY"],
        limit: 10
      };
      
      const searchResponse = await axios.post(
        `${API_BASE_URL}/v2/catalog/search`, 
        searchRequest,
        { headers }
      );
      
      console.log('✅ Search endpoint response:');
      if (searchResponse.data.objects) {
        console.log(`Search found ${searchResponse.data.objects.length} objects`);
      } else {
        console.log('No objects found in search');
      }
    } catch (error) {
      console.error('❌ Error testing search endpoint:');
      logError(error);
    }
    
    // Test 4: Create a test catalog item
    console.log('\n[TEST 4] Testing catalog/item (CREATE) endpoint');
    let createdItemId = null;
    try {
      const newItem = {
        type: 'ITEM',
        name: `Test Item ${new Date().toISOString()}`,
        description: 'This is a test item created by the diagnostic script',
        idempotencyKey: `test-${Date.now()}`
      };
      
      const createResponse = await axios.post(
        `${API_BASE_URL}/v2/catalog/item`,
        newItem,
        { headers }
      );
      
      createdItemId = createResponse.data.catalogObject.id;
      console.log(`✅ Created test item with ID: ${createdItemId}`);
      console.log(JSON.stringify({
        id: createResponse.data.catalogObject.id,
        type: createResponse.data.catalogObject.type,
        version: createResponse.data.catalogObject.version
      }, null, 2));
      
      // If we created an item, let's try to retrieve it
      if (createdItemId) {
        console.log('\n[TEST 5] Testing catalog/item/{id} (GET) endpoint');
        try {
          const getResponse = await axios.get(
            `${API_BASE_URL}/v2/catalog/item/${createdItemId}`,
            { headers }
          );
          
          console.log('✅ Retrieved item:');
          console.log(JSON.stringify({
            id: getResponse.data.catalogObject.id,
            name: getResponse.data.catalogObject.itemData?.name,
            version: getResponse.data.catalogObject.version
          }, null, 2));
          
        } catch (error) {
          console.error('❌ Error retrieving created item:');
          logError(error);
        }
        
        // Clean up - delete the test item
        console.log('\n[TEST 6] Testing catalog/item/{id} (DELETE) endpoint');
        try {
          const deleteResponse = await axios.delete(
            `${API_BASE_URL}/v2/catalog/item/${createdItemId}`,
            { headers }
          );
          
          console.log('✅ Deleted test item:');
          console.log(JSON.stringify(deleteResponse.data, null, 2));
        } catch (error) {
          console.error('❌ Error deleting test item:');
          logError(error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating test item:');
      logError(error);
    }
    
    console.log('\n===========================================');
    console.log('Catalog API Test Summary');
    console.log('===========================================');
    console.log('Tests completed. Check the logs above for any errors.');
    console.log('If you see all ✅ checkmarks, the catalog API is working correctly.');
    console.log('===========================================');
    
  } catch (error) {
    console.error('Unexpected error running tests:');
    console.error(error);
  }
}

// Helper function to log errors in a consistent format
function logError(error) {
  if (error.response) {
    console.error(`Status: ${error.response.status}`);
    console.error('Response data:', error.response.data);
  } else if (error.request) {
    console.error('No response received');
  } else {
    console.error('Error message:', error.message);
  }
}

// Run the test
testCatalogAPI(); 