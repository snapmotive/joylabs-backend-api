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
echo "- JWT_SECRET=${JWT_SECRET:0:4}..."
echo "- USERS_TABLE=$USERS_TABLE"
echo "- ENABLE_MOCK_DATA=$ENABLE_MOCK_DATA"

# Export all required environment variables
export JWT_SECRET
export USERS_TABLE
export ENABLE_MOCK_DATA
export SQUARE_APPLICATION_ID
export SQUARE_APPLICATION_SECRET
export SQUARE_ENVIRONMENT
export SQUARE_REDIRECT_URL

# Start the server with environment variables
exec npx serverless offline

# Note: You should access the server at http://localhost:3001/api/auth/square/test 