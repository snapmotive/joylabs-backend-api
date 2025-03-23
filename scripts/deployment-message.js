/**
 * Custom deployment message script
 * Displays the correct API and redirect URLs after deployment
 */

'use strict';

module.exports.handler = async () => {
  const stage = process.env.SLS_STAGE || 'dev';
  const apiUrl = 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com';
  
  console.log('\n===== JOYLABS API - DEPLOYMENT SUMMARY =====');
  console.log(`\nEnvironment: ${stage.toUpperCase()}`);
  console.log('\nAPI URLs:');
  console.log(`- Base API:     ${apiUrl}/${stage}`);
  console.log(`- Square Auth:  ${apiUrl}/${stage}/api/auth/square/callback`);
  console.log(`- Square Webhook: ${apiUrl}/${stage}/api/webhooks/square (POST only)`);
  
  console.log('\nIMPORTANT:');
  console.log('1. Ensure your Square Developer Console redirect URL is set to:');
  console.log(`   ${apiUrl}/${stage}/api/auth/square/callback`);
  console.log('2. Ensure your Square Developer Console webhook URL is set to:');
  console.log(`   ${apiUrl}/${stage}/api/webhooks/square`);
  console.log('\n===========================================\n');
}; 