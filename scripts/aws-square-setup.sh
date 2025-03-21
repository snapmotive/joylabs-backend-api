#!/bin/bash

# Script to add Square credentials to AWS SSM Parameter Store
# This is a secure way to store your production credentials

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

echo "🔐 Setting up Square credentials in AWS SSM Parameter Store for $ENV environment"
echo "================================================================================"

# Load credentials from .env.local
if [ -f .env.local ]; then
    source <(grep -v '^#' .env.local | sed -E 's/(.*)=(.*)$/export \1="\2"/')
    
    # Show truncated values for confirmation
    APP_ID_TRUNCATED="${SQUARE_APPLICATION_ID:0:4}...${SQUARE_APPLICATION_ID: -4}"
    APP_SECRET_TRUNCATED="${SQUARE_APPLICATION_SECRET:0:4}...${SQUARE_APPLICATION_SECRET: -4}"
    
    echo "Found credentials in .env.local:"
    echo "- SQUARE_APPLICATION_ID: $APP_ID_TRUNCATED"
    echo "- SQUARE_APPLICATION_SECRET: $APP_SECRET_TRUNCATED"
    echo "- SQUARE_ENVIRONMENT: $SQUARE_ENVIRONMENT"
    
    read -p "Use these credentials? (y/n): " USE_LOCAL
    
    if [[ $USE_LOCAL != "y" && $USE_LOCAL != "Y" ]]; then
        echo "Please enter credentials manually:"
        read -p "Square Application ID: " SQUARE_APPLICATION_ID
        read -p "Square Application Secret: " SQUARE_APPLICATION_SECRET
        read -p "Square Environment (sandbox/production): " SQUARE_ENVIRONMENT
        SQUARE_ENVIRONMENT=${SQUARE_ENVIRONMENT:-sandbox}
    fi
else
    echo "No .env.local file found. Please enter credentials manually:"
    read -p "Square Application ID: " SQUARE_APPLICATION_ID
    read -p "Square Application Secret: " SQUARE_APPLICATION_SECRET
    read -p "Square Environment (sandbox/production): " SQUARE_ENVIRONMENT
    SQUARE_ENVIRONMENT=${SQUARE_ENVIRONMENT:-sandbox}
fi

# Confirm before proceeding
echo
echo "Will set the following parameters in AWS SSM for $ENV environment:"
echo "- /joylabs/$ENV/square-app-id: ${SQUARE_APPLICATION_ID:0:4}...${SQUARE_APPLICATION_ID: -4}"
echo "- /joylabs/$ENV/square-app-secret: ${SQUARE_APPLICATION_SECRET:0:4}...${SQUARE_APPLICATION_SECRET: -4}"
echo "- /joylabs/$ENV/square-environment: $SQUARE_ENVIRONMENT"
echo

read -p "Proceed? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
    echo "Operation cancelled."
    exit 0
fi

# Set parameters in SSM
echo "Setting parameters in AWS SSM..."

# Application ID (as secure string)
aws ssm put-parameter \
    --name "/joylabs/$ENV/square-app-id" \
    --value "$SQUARE_APPLICATION_ID" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION"

# Application Secret (as secure string)
aws ssm put-parameter \
    --name "/joylabs/$ENV/square-app-secret" \
    --value "$SQUARE_APPLICATION_SECRET" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION"

# Environment (as regular string)
aws ssm put-parameter \
    --name "/joylabs/$ENV/square-environment" \
    --value "$SQUARE_ENVIRONMENT" \
    --type "String" \
    --overwrite \
    --region "$REGION"

echo "✅ Square credentials have been securely stored in AWS SSM Parameter Store!"
echo
echo "To deploy your application using these credentials, run:"
echo "npm run deploy -- --stage $ENV"
echo
echo "For local development, continue using .env.local" 