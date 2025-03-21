#!/bin/bash

# Script to check AWS SSM parameters for Square credentials
# This script allows you to verify your parameters are set correctly in AWS

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Prompt for AWS region
read -p "Enter AWS region (default: us-west-1): " REGION
REGION=${REGION:-us-west-1}

# Prompt for environment
read -p "Enter environment (dev/staging/production): " ENV
ENV=${ENV:-dev}

echo "🔍 Checking AWS SSM parameters for $ENV environment in $REGION"
echo "=============================================================="

# Check Square App ID
echo "Checking /joylabs/$ENV/square-app-id..."
APP_ID=$(aws ssm get-parameter --name "/joylabs/$ENV/square-app-id" --with-decryption --region "$REGION" 2>/dev/null)
if [ $? -eq 0 ]; then
    APP_ID_VALUE=$(echo $APP_ID | jq -r '.Parameter.Value')
    APP_ID_TRUNCATED="${APP_ID_VALUE:0:4}...${APP_ID_VALUE: -4}"
    echo "✅ Square Application ID: $APP_ID_TRUNCATED"
else
    echo "❌ Square Application ID not found"
fi

# Check Square App Secret
echo "Checking /joylabs/$ENV/square-app-secret..."
APP_SECRET=$(aws ssm get-parameter --name "/joylabs/$ENV/square-app-secret" --with-decryption --region "$REGION" 2>/dev/null)
if [ $? -eq 0 ]; then
    APP_SECRET_VALUE=$(echo $APP_SECRET | jq -r '.Parameter.Value')
    APP_SECRET_TRUNCATED="${APP_SECRET_VALUE:0:4}...${APP_SECRET_VALUE: -4}"
    echo "✅ Square Application Secret: $APP_SECRET_TRUNCATED"
else
    echo "❌ Square Application Secret not found"
fi

# Check Square Environment
echo "Checking /joylabs/$ENV/square-environment..."
ENV_PARAM=$(aws ssm get-parameter --name "/joylabs/$ENV/square-environment" --region "$REGION" 2>/dev/null)
if [ $? -eq 0 ]; then
    ENV_VALUE=$(echo $ENV_PARAM | jq -r '.Parameter.Value')
    echo "✅ Square Environment: $ENV_VALUE"
else
    echo "❌ Square Environment not found"
fi

# Check JWT Secret
echo "Checking /joylabs/$ENV/jwt-secret..."
JWT_SECRET=$(aws ssm get-parameter --name "/joylabs/$ENV/jwt-secret" --with-decryption --region "$REGION" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ JWT Secret: [SECURED]"
else
    echo "❌ JWT Secret not found"
fi

echo
echo "To set these parameters, run: npm run aws:square-setup" 