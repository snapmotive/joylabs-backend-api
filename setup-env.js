/**
 * Environment Setup Script
 * 
 * This script sets up a proper .env.local file with example values
 * while preventing secrets from being committed to the repository.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_TEMPLATE_PATH = path.join(__dirname, '.env.template');
const ENV_LOCAL_PATH = path.join(__dirname, '.env.local');

// Create a template file with placeholder values if it doesn't exist
if (!fs.existsSync(ENV_TEMPLATE_PATH)) {
  const templateContent = `# Square configuration - Template (COPY TO .env.local AND UPDATE VALUES)
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=your_square_application_id
SQUARE_APPLICATION_SECRET=your_square_application_secret
SQUARE_WEBHOOK_SIGNATURE_KEY=your_square_webhook_signature_key
SQUARE_REDIRECT_URL=http://localhost:3001/api/auth/square/callback

# AWS Configuration
REGION=us-west-1
NODE_ENV=development
IS_OFFLINE=true

# API Configuration
API_BASE_URL=http://localhost:3001

# Secrets
JWT_SECRET=random_jwt_secret_value
SESSION_SECRET=random_session_secret_value

# Testing configuration
ENABLE_MOCK_DATA=true

# Table names
USERS_TABLE=joylabs-catalog-users-v3-dev
SESSIONS_TABLE=joylabs-sessions-v3-dev
PRODUCTS_TABLE=joylabs-catalog-products-v3-dev
CATEGORIES_TABLE=joylabs-catalog-categories-v3-dev
WEBHOOKS_TABLE=joylabs-catalog-webhooks-v3-dev
MERCHANT_TABLE=joylabs-backend-api-merchants-v3-dev
WEBHOOK_TABLE=joylabs-backend-api-webhooks-v3-dev

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000
`;

  fs.writeFileSync(ENV_TEMPLATE_PATH, templateContent);
  console.log(`📝 Created template file at ${ENV_TEMPLATE_PATH}`);
}

// Check if local env file exists, create one with secure defaults if not
if (!fs.existsSync(ENV_LOCAL_PATH)) {
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  
  const localContent = `# Square configuration - Local development overrides
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=
SQUARE_APPLICATION_SECRET=
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_REDIRECT_URL=http://localhost:3001/api/auth/square/callback

# AWS Configuration
REGION=us-west-1
NODE_ENV=development
IS_OFFLINE=true

# API Configuration
API_BASE_URL=http://localhost:3001

# Secrets
JWT_SECRET=${jwtSecret}
SESSION_SECRET=${sessionSecret}

# Testing configuration
ENABLE_MOCK_DATA=true

# Table names
USERS_TABLE=joylabs-catalog-users-v3-dev
SESSIONS_TABLE=joylabs-sessions-v3-dev
PRODUCTS_TABLE=joylabs-catalog-products-v3-dev
CATEGORIES_TABLE=joylabs-catalog-categories-v3-dev
WEBHOOKS_TABLE=joylabs-catalog-webhooks-v3-dev
MERCHANT_TABLE=joylabs-backend-api-merchants-v3-dev
WEBHOOK_TABLE=joylabs-backend-api-webhooks-v3-dev

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000
`;

  fs.writeFileSync(ENV_LOCAL_PATH, localContent);
  console.log(`✅ Created .env.local file with secure defaults at ${ENV_LOCAL_PATH}`);
  console.log(`🔐 Generated random JWT_SECRET and SESSION_SECRET for local development`);
}

console.log(`\n⚠️  IMPORTANT SECURITY REMINDER ⚠️`);
console.log(`1. Never commit .env.local or any .env.* files with real secrets`);
console.log(`2. Update your .env.local with your actual Square application credentials`);
console.log(`3. For production, use AWS Secrets Manager or similar services\n`);
console.log(`To run locally:`);
console.log(`npm run dev\n`); 