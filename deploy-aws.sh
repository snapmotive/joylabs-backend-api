#!/bin/bash

# Set colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Deploying JoyLabs AWS Backend..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null
then
    echo "AWS CLI is required but not installed. Please install it first."
    exit 1
fi

# Check if serverless is installed
if ! command -v serverless &> /dev/null
then
    echo "Serverless Framework is required but not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
echo "Checking AWS credentials..."
aws sts get-caller-identity

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: AWS credentials not configured properly${NC}"
    exit 1
fi

# Deploy with Serverless Framework
echo "Deploying with Serverless Framework..."
npm run deploy:prod

# Check if deployment was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment completed successfully!${NC}"

# Get the API Gateway URL from the serverless output file
API_URL=$(grep -o 'https://[a-zA-Z0-9]*\.execute-api\.[a-z0-9\-]*\.amazonaws\.com/production/' .serverless/serverless-state.json | head -1)

if [ -z "$API_URL" ]; then
    # Fallback to the known URL if we can't extract it
    API_URL="https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/"
fi

echo -e "Your API is now available at: ${GREEN}${API_URL}${NC}"

# Get the correct callback URL
CALLBACK_URL="${API_URL}api/auth/square/callback"
# Clean up any double slashes while preserving https://
CALLBACK_URL=$(echo $CALLBACK_URL | sed 's#\([^:]\)//\+#\1/#g')

echo -e "${YELLOW}Note: The v3 service has been deployed - all tables and resources have v3 suffixes.${NC}"
echo -e "Remember to update your Square Developer Console with the new redirect URL:"
echo -e "${GREEN}${CALLBACK_URL}${NC}"

echo -e "To test the OAuth flow locally:"
echo -e "${YELLOW}npm run test:oauth${NC}" 