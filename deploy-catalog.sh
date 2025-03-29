#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=======================================================${NC}"
echo -e "${GREEN}Deploying JoyLabs Catalog Lambda Function${NC}"
echo -e "${YELLOW}=======================================================${NC}"

# Check if serverless is installed
if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: npx is not installed. Please install Node.js and npm.${NC}"
  exit 1
fi

# Check AWS credentials
echo -e "${YELLOW}Verifying AWS credentials...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null)

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: AWS credentials are not configured correctly.${NC}"
  echo -e "Run ${YELLOW}aws configure${NC} and provide your AWS access key and secret access key."
  exit 1
fi

echo -e "${GREEN}AWS credentials verified. Using account: ${AWS_ACCOUNT_ID}${NC}"

# Deploy only the catalog function
echo -e "${YELLOW}Deploying catalog function...${NC}"
npx serverless deploy function --function catalog

if [ $? -ne 0 ]; then
  echo -e "${RED}Deployment failed!${NC}"
  exit 1
fi

echo -e "${GREEN}Catalog function deployed successfully!${NC}"

# Extract API Gateway URL
if [ -f .serverless/serverless-state.json ]; then
  API_URL=$(grep -o 'https://[^"]*execute-api[^"]*' .serverless/serverless-state.json | head -1)
  
  if [ -z "$API_URL" ]; then
    API_URL="https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/"
  fi
  
  # Ensure URL ends with "/"
  if [[ ! $API_URL == */ ]]; then
    API_URL="${API_URL}/"
  fi
  
  echo -e "${GREEN}Available API endpoints:${NC}"
  echo -e "${YELLOW}List catalog items:${NC} GET ${API_URL}api/catalog/list"
  echo -e "${YELLOW}Get catalog item:${NC} GET ${API_URL}api/catalog/item/{id}"
  echo -e "${YELLOW}Create catalog item:${NC} POST ${API_URL}api/catalog/item"
  echo -e "${YELLOW}Search catalog:${NC} POST ${API_URL}api/catalog/search"
  echo -e "${YELLOW}Batch operations:${NC} POST ${API_URL}api/catalog/batch-retrieve"
  
  echo -e "\n${YELLOW}Note:${NC} All requests require authentication with a Square access token."
else
  echo -e "${YELLOW}Could not determine API URL.${NC}"
fi

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${YELLOW}Run the test script with:${NC} node test-catalog-api.js YOUR_SQUARE_ACCESS_TOKEN"
echo -e "${YELLOW}=======================================================${NC}" 