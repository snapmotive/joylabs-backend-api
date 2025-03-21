/**
 * AWS Secrets Manager Setup Script
 * 
 * This script helps set up secrets in AWS Secrets Manager for production deployment
 * IMPORTANT: Run this manually from a secure environment, NOT from CI/CD
 */

const { SecretsManagerClient, CreateSecretCommand, UpdateSecretCommand } = require('@aws-sdk/client-secrets-manager');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create prompt function that returns a Promise
const prompt = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('🔐 AWS Secrets Manager Setup for JoyLabs Backend');
  console.log('================================================\n');
  
  try {
    // Get AWS region and stage
    const region = await prompt('Enter AWS region (default: us-west-1): ') || 'us-west-1';
    const stage = await prompt('Enter deployment stage (dev/staging/production): ') || 'dev';
    
    // Create Secrets Manager client
    const client = new SecretsManagerClient({ region });
    
    // Get secrets from user
    console.log('\n📝 Enter your Square API credentials:');
    const squareAppId = await prompt('Square Application ID: ');
    const squareAppSecret = await prompt('Square Application Secret: ');
    const jwtSecret = await prompt('JWT Secret (leave empty to generate random): ') || 
      require('crypto').randomBytes(32).toString('hex');
    
    // Create or update secrets
    await setupSecret(client, `/joylabs/${stage}/square-app-id`, squareAppId, stage);
    await setupSecret(client, `/joylabs/${stage}/square-app-secret`, squareAppSecret, stage);
    await setupSecret(client, `/joylabs/${stage}/jwt-secret`, jwtSecret, stage);
    
    console.log('\n✅ Secrets have been set up successfully in AWS Secrets Manager.');
    console.log('\n🚀 Next steps:');
    console.log(`1. Deploy the app: npm run deploy -- --stage ${stage}`);
    console.log(`2. For local development, run: npm run setup-env\n`);
  } catch (error) {
    console.error('❌ Error setting up secrets:', error);
  } finally {
    rl.close();
  }
}

async function setupSecret(client, secretName, secretValue, stage) {
  const fullSecretName = `joylabs${secretName}`;
  
  try {
    // Try to update existing secret
    await client.send(new UpdateSecretCommand({
      SecretId: fullSecretName,
      SecretString: secretValue
    }));
    console.log(`Updated existing secret: ${secretName}`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Create new secret if it doesn't exist
      await client.send(new CreateSecretCommand({
        Name: fullSecretName,
        SecretString: secretValue,
        Description: `JoyLabs backend secret for ${stage}`,
        Tags: [
          { Key: 'Application', Value: 'joylabs-backend' },
          { Key: 'Environment', Value: stage }
        ]
      }));
      console.log(`Created new secret: ${secretName}`);
    } else {
      throw error;
    }
  }
}

main(); 