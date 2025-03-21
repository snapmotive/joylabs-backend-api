/**
 * Credential Rotation Script
 * 
 * This script helps with secure rotation of sensitive credentials
 * It automatically creates new tokens and updates AWS Secrets Manager
 */

const { SecretsManagerClient, UpdateSecretCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create prompt function that returns a Promise
const prompt = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('🔄 Credential Rotation for JoyLabs Backend');
  console.log('==========================================\n');
  
  try {
    // Get AWS region and stage
    const region = await prompt('Enter AWS region (default: us-west-1): ') || 'us-west-1';
    const stage = await prompt('Enter deployment stage (dev/staging/production): ') || 'dev';
    
    // Select which credential to rotate
    console.log('\n📋 Which credential do you want to rotate?');
    console.log('1. JWT Secret');
    console.log('2. Square API credentials');
    
    const choice = await prompt('\nChoice (1-2): ');
    
    // Create Secrets Manager client
    const client = new SecretsManagerClient({ region });
    
    if (choice === '1') {
      await rotateJwtSecret(client, stage);
    } else if (choice === '2') {
      await rotateSquareCredentials(client, stage);
    } else {
      console.log('❌ Invalid choice. Please run the script again.');
    }
  } catch (error) {
    console.error('❌ Error rotating credentials:', error);
  } finally {
    rl.close();
  }
}

async function rotateJwtSecret(client, stage) {
  console.log('\n🔐 Rotating JWT Secret...');
  
  // Generate a new secure JWT secret
  const newJwtSecret = crypto.randomBytes(64).toString('hex');
  
  // Confirm before updating
  console.log(`\nNew JWT Secret: ${newJwtSecret.substring(0, 8)}...${newJwtSecret.substring(newJwtSecret.length - 8)}`);
  const confirm = await prompt('\nConfirm rotation (y/n)? ');
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('Operation canceled.');
    return;
  }
  
  // Update the secret
  await updateSecret(client, `/joylabs/${stage}/jwt-secret`, newJwtSecret);
  
  console.log('\n✅ JWT Secret rotated successfully.');
  console.log('\n⚠️ IMPORTANT: This change requires re-deployment of the application.');
  console.log(`Run: npm run deploy -- --stage ${stage}`);
}

async function rotateSquareCredentials(client, stage) {
  console.log('\n⚠️ Square API credential rotation requires manual steps:');
  console.log('1. Log in to Square Developer Dashboard');
  console.log('2. Create new application credentials or reset existing ones');
  console.log('3. Enter the new credentials below\n');
  
  const newAppId = await prompt('New Square Application ID: ');
  const newAppSecret = await prompt('New Square Application Secret: ');
  
  // Confirm before updating
  const confirm = await prompt('\nConfirm updating credentials in AWS Secrets Manager (y/n)? ');
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('Operation canceled.');
    return;
  }
  
  // Update the secrets
  await updateSecret(client, `/joylabs/${stage}/square-app-id`, newAppId);
  await updateSecret(client, `/joylabs/${stage}/square-app-secret`, newAppSecret);
  
  console.log('\n✅ Square credentials updated successfully.');
  console.log('\n⚠️ IMPORTANT: This change requires re-deployment of the application.');
  console.log(`Run: npm run deploy -- --stage ${stage}`);
}

async function updateSecret(client, secretName, secretValue) {
  const fullSecretName = `joylabs${secretName}`;
  
  try {
    await client.send(new UpdateSecretCommand({
      SecretId: fullSecretName,
      SecretString: secretValue
    }));
    console.log(`Updated secret: ${secretName}`);
  } catch (error) {
    console.error(`Error updating ${secretName}:`, error);
    throw error;
  }
}

main(); 