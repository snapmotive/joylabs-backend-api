#!/bin/bash

# Kill any running serverless offline processes
pkill -f "serverless offline" || true

# Set environment variables
export IS_OFFLINE=true
export NODE_ENV=production
export JWT_SECRET=testing123
export USERS_TABLE=users-prod
export ENABLE_MOCK_DATA=false
export SQUARE_APPLICATION_ID=sq0idp-WFTYv3An7NPv6ovGFLld1Q
export SQUARE_APPLICATION_SECRET=sq0csp-z8vgtFYXtjEbXMGW9fjSgw9KsMLzJpoc7RrCCPoLdE4
export SQUARE_ENVIRONMENT=production
export SQUARE_REDIRECT_URL=http://localhost:3001/api/auth/square/callback
export FRONTEND_URL=http://localhost:3000

# Start the server
DEBUG=* node -r dotenv/config ./node_modules/.bin/serverless offline 