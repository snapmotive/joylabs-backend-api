/**
 * Update Square credentials in AWS Secrets Manager
 * 
 * This script updates the Square credentials in AWS Secrets Manager
 * without exposing the credentials in shell history or environment variables.
 */
require('dotenv').config();
const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, CreateSecretCommand, DescribeSecretCommand } = require('@aws-sdk/client-secrets-manager');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = {};
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    args[key] = value || true;
  }
});

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Securely ask for input
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Main function
async function updateSecrets() {
  try {
    // Get current environment
    const stage = args.stage || 'development';
    console.log(`Updating Square credentials for ${stage} environment`);
    
    // Get AWS region from environment or use default
    const region = args.region || process.env.AWS_REGION || 'us-west-1';
    console.log(`Using AWS region: ${region}`);
    
    // Create Secrets Manager client
    const secretsManager = new SecretsManagerClient({ region });
    
    // Get the secret name from environment variables
    const secretName = process.env.SQUARE_CREDENTIALS_SECRET || `square-credentials-${stage}`;
    console.log(`Using secret name: ${secretName}`);
    
    // Ask for Square credentials
    console.log('\nPlease enter your Square application credentials:');
    const applicationId = await question('Application ID (sq0idp-...): ');
    const applicationSecret = await question('Application Secret (sq0csp-...): ');
    const webhookSignatureKey = await question('Webhook Signature Key: ');
    
    // Validate input
    if (!applicationId.startsWith('sq0idp-')) {
      throw new Error('Invalid Application ID format. It should start with sq0idp-');
    }
    
    if (!applicationSecret.startsWith('sq0csp-')) {
      throw new Error('Invalid Application Secret format. It should start with sq0csp-');
    }
    
    if (!webhookSignatureKey || webhookSignatureKey.length < 10) {
      console.warn('Warning: Webhook signature key seems short or invalid. Continue anyway? (y/n)');
      const confirm = await question('');
      if (confirm.toLowerCase() !== 'y') {
        throw new Error('Operation cancelled');
      }
    }
    
    // Prepare secret value
    const secretValue = JSON.stringify({
      applicationId,
      applicationSecret,
      webhookSignatureKey
    });
    
    // Check if secret exists
    let secretExists = false;
    try {
      await secretsManager.send(new DescribeSecretCommand({ SecretId: secretName }));
      secretExists = true;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }
    
    // Update or create secret
    if (secretExists) {
      console.log(`Updating existing secret: ${secretName}`);
      await secretsManager.send(new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretValue
      }));
    } else {
      console.log(`Creating new secret: ${secretName}`);
      await secretsManager.send(new CreateSecretCommand({
        Name: secretName,
        Description: `Square API credentials for ${stage}`,
        SecretString: secretValue
      }));
    }
    
    console.log('\n✅ Square credentials successfully updated in AWS Secrets Manager!');
    console.log(`Secret ID: ${secretName}`);
    
    // Update local .env.local file for development
    if (stage === 'development') {
      console.log('\nUpdating local .env.local file for development...');
      
      let envContent = '';
      if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
        envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
      }
      
      // Update environment variables
      const envVars = {
        SQUARE_APPLICATION_ID: applicationId,
        SQUARE_APPLICATION_SECRET: applicationSecret,
        SQUARE_WEBHOOK_SIGNATURE_KEY: webhookSignatureKey
      };
      
      Object.entries(envVars).forEach(([key, value]) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      });
      
      fs.writeFileSync(path.join(__dirname, '..', '.env.local'), envContent);
      console.log('Local .env.local file updated successfully.');
    }
    
  } catch (error) {
    console.error('Error updating Square credentials:', error);
  } finally {
    rl.close();
  }
}

// Run the script
updateSecrets(); 