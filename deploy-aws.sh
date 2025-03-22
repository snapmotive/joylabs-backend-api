#!/bin/bash

# This script deploys the JoyLabs backend API to AWS

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
    echo "AWS credentials are not configured properly. Please run 'aws configure'."
    exit 1
fi

# Deploy using Serverless Framework
echo "Deploying with Serverless Framework..."
npm run deploy:prod

# Check if deployment was successful
if [ $? -ne 0 ]; then
    echo "Deployment failed. Please check the error messages above."
    exit 1
fi

echo "Deployment completed successfully!"
echo "Your API is now available at: https://ux8uq7hd24.execute-api.us-west-1.amazonaws.com/production/"
echo ""
echo "Note: The v3 service has been deployed - all tables and resources have v3 suffixes."

# Load environment variables
source .env.production

echo "Remember to update your Square Developer Console with the new redirect URL:"
echo "$SQUARE_REDIRECT_URL"
echo ""
echo "To test the OAuth flow locally:"
echo "npm run test:oauth" 