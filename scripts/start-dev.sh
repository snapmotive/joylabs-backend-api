#!/bin/bash

# Load environment variables from .env or .env.local if available
if [ -f .env.local ]; then
  echo "Loading environment from .env.local..."
  export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
  echo "Loading environment from .env..."
  export $(grep -v '^#' .env | xargs)
else
  echo "No .env file found. Please create one with required values."
  exit 1
fi

# Set development environment
export NODE_ENV=development
export IS_OFFLINE=true

# Start the server
echo "Starting server with environment:"
echo "- SQUARE_ENVIRONMENT=$SQUARE_ENVIRONMENT"
echo "- API_BASE_URL=$API_BASE_URL"
echo "- SQUARE_APPLICATION_ID=${SQUARE_APPLICATION_ID:0:4}...${SQUARE_APPLICATION_ID: -4}"

exec npm run dev 