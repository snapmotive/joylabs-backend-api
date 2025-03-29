#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print a step message
print_step() {
  echo -e "${GREEN}==>${NC} $1"
}

# Print an info message
print_info() {
  echo -e "${YELLOW}-->${NC} $1"
}

# Print an error message
print_error() {
  echo -e "${RED}ERROR:${NC} $1"
}

# Function to display usage
usage() {
  echo "Usage: $0 <function-name>"
  echo ""
  echo "Available functions:"
  echo "  api       - Deploy the main API function"
  echo "  catalog   - Deploy the catalog function"
  echo "  webhooks  - Deploy the webhooks function"
  echo "  oauth     - Deploy the OAuth function"
  echo ""
  echo "Example: $0 catalog"
  exit 1
}

# Check if a function name is provided
if [ "$#" -ne 1 ]; then
  print_error "No function name provided"
  usage
fi

FUNCTION_NAME=$1

# Validate function name
if [[ ! "$FUNCTION_NAME" =~ ^(api|catalog|webhooks|oauth)$ ]]; then
  print_error "Invalid function name: $FUNCTION_NAME"
  usage
fi

# Check if Serverless is installed
if ! command -v serverless &> /dev/null && ! command -v sls &> /dev/null; then
  print_error "Serverless Framework is not installed. Please install it globally with: npm install -g serverless"
  exit 1
fi

# Check AWS credentials
print_step "Verifying AWS credentials"
if ! aws sts get-caller-identity &> /dev/null; then
  print_error "AWS credentials are not configured or invalid. Please run 'aws configure' to set them up."
  exit 1
fi

# Deploy the function
print_step "Deploying $FUNCTION_NAME function"
print_info "This may take a few minutes..."

if serverless deploy function --function $FUNCTION_NAME; then
  print_step "$FUNCTION_NAME function deployed successfully!"
else
  print_error "$FUNCTION_NAME function deployment failed."
  exit 1
fi 