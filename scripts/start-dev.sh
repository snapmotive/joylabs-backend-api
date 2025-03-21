#!/bin/bash

# Kill any running serverless offline processes
pkill -f "serverless offline" || true

# Set environment variables
export IS_OFFLINE=true
export NODE_ENV=development
export JWT_SECRET=testing123
export USERS_TABLE=users-dev
export ENABLE_MOCK_DATA=true
export SQUARE_APPLICATION_ID=sq0idp-WFTYv3An7NPv6ovGFLld1Q
export SQUARE_APPLICATION_SECRET=EAAAEH_GBSrWxvSKfg_uWXkZHI1UpQhxjlL-2wWVLWU5qJnkYvGh8ZKLtVZ4L5oK
export SQUARE_ENVIRONMENT=sandbox
export SQUARE_REDIRECT_URL=http://localhost:3001/api/auth/square/callback
export FRONTEND_URL=http://localhost:3000

# Start the server
DEBUG=* node -r dotenv/config ./node_modules/.bin/serverless offline 