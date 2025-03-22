#!/bin/bash

# Stop any existing serverless offline process
pkill -f "serverless offline" || true

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  echo "Loading environment from .env.local..."
  export $(grep -v '^#' .env.local | xargs)
else
  echo ".env.local not found. Please run 'node setup-env.js' to create it."
  exit 1
fi

# Force production mode
export SQUARE_ENVIRONMENT=production

# Don't output secrets to logs
echo "Starting server with environment:"
echo "- SQUARE_ENVIRONMENT=$SQUARE_ENVIRONMENT"
echo "- SQUARE_REDIRECT_URL=$SQUARE_REDIRECT_URL"
echo "- SQUARE_APPLICATION_ID=${SQUARE_APPLICATION_ID:0:4}...${SQUARE_APPLICATION_ID: -4}"
echo "- SQUARE_WEBHOOK_SIGNATURE_KEY=${SQUARE_WEBHOOK_SIGNATURE_KEY:0:4}...${SQUARE_WEBHOOK_SIGNATURE_KEY: -4}"
echo "- JWT_SECRET=${JWT_SECRET:0:4}..."
echo "- SESSION_SECRET=${SESSION_SECRET:0:4}..."
echo "- USERS_TABLE=$USERS_TABLE"
echo "- SESSIONS_TABLE=$SESSIONS_TABLE"
echo "- PRODUCTS_TABLE=$PRODUCTS_TABLE"
echo "- CATEGORIES_TABLE=$CATEGORIES_TABLE"
echo "- WEBHOOKS_TABLE=$WEBHOOKS_TABLE"
echo "- MERCHANT_TABLE=$MERCHANT_TABLE"
echo "- WEBHOOK_TABLE=$WEBHOOK_TABLE"
echo "- ENABLE_MOCK_DATA=$ENABLE_MOCK_DATA"

# Export all required environment variables
export JWT_SECRET
export SESSION_SECRET
export USERS_TABLE
export SESSIONS_TABLE
export PRODUCTS_TABLE
export CATEGORIES_TABLE
export WEBHOOKS_TABLE
export MERCHANT_TABLE
export WEBHOOK_TABLE
export ENABLE_MOCK_DATA
export SQUARE_APPLICATION_ID
export SQUARE_APPLICATION_SECRET
export SQUARE_WEBHOOK_SIGNATURE_KEY
export SQUARE_ENVIRONMENT
export SQUARE_REDIRECT_URL
export API_BASE_URL
export REGION
export NODE_ENV=development
export IS_OFFLINE=true

# Start the server with environment variables
exec npx serverless offline

# Note: You should access the server at http://localhost:3001/api/auth/square/test 