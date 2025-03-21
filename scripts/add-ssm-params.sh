#!/bin/bash

# Script to add or update SSM parameters for JoyLabs Backend
# This script is used to quickly set up the required SSM parameters for local testing

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Check arguments
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <stage> [region]"
    echo "Example: $0 dev us-west-1"
    exit 1
fi

STAGE=$1
REGION=${2:-us-west-1}

echo "🔐 Setting up SSM parameters for stage: $STAGE in region: $REGION"
echo "=============================================================="

# Confirm before proceeding
read -p "This will create or update SSM parameters. Continue? (y/n): " confirm
if [[ $confirm != "y" && $confirm != "Y" ]]; then
    echo "Operation canceled."
    exit 0
fi

echo
echo "Enter values for each parameter (leave empty to skip):"

read -p "JWT Secret (leave empty to generate random): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "Generated random JWT Secret: ${JWT_SECRET:0:8}...${JWT_SECRET: -8}"
fi

read -p "Square Application ID: " SQUARE_APP_ID
read -p "Square Application Secret: " SQUARE_APP_SECRET
read -p "Square Environment (sandbox/production): " SQUARE_ENV
SQUARE_ENV=${SQUARE_ENV:-sandbox}

echo
echo "Summary of parameters to create/update:"
echo "- /joylabs/$STAGE/jwt-secret: ${JWT_SECRET:0:8}...${JWT_SECRET: -8}"
if [ -n "$SQUARE_APP_ID" ]; then
    echo "- /joylabs/$STAGE/square-app-id: ${SQUARE_APP_ID:0:4}...${SQUARE_APP_ID: -4}"
fi
if [ -n "$SQUARE_APP_SECRET" ]; then
    echo "- /joylabs/$STAGE/square-app-secret: ${SQUARE_APP_SECRET:0:4}...${SQUARE_APP_SECRET: -4}"
fi
echo "- /joylabs/$STAGE/square-environment: $SQUARE_ENV"

read -p "Confirm creation of these parameters? (y/n): " confirm
if [[ $confirm != "y" && $confirm != "Y" ]]; then
    echo "Operation canceled."
    exit 0
fi

# Create or update the parameters
echo "Creating parameters..."

aws ssm put-parameter \
    --name "/joylabs/$STAGE/jwt-secret" \
    --value "$JWT_SECRET" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION"

if [ -n "$SQUARE_APP_ID" ]; then
    aws ssm put-parameter \
        --name "/joylabs/$STAGE/square-app-id" \
        --value "$SQUARE_APP_ID" \
        --type "SecureString" \
        --overwrite \
        --region "$REGION"
fi

if [ -n "$SQUARE_APP_SECRET" ]; then
    aws ssm put-parameter \
        --name "/joylabs/$STAGE/square-app-secret" \
        --value "$SQUARE_APP_SECRET" \
        --type "SecureString" \
        --overwrite \
        --region "$REGION"
fi

aws ssm put-parameter \
    --name "/joylabs/$STAGE/square-environment" \
    --value "$SQUARE_ENV" \
    --type "String" \
    --overwrite \
    --region "$REGION"

echo
echo "✅ Parameters created/updated successfully!"
echo
echo "Next steps:"
echo "1. Deploy the application: npm run deploy -- --stage $STAGE"
echo "2. For local development, update your .env.local file if needed" 