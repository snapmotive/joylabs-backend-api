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

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
  print_error "AWS CLI is not installed. Please install it first."
  exit 1
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

# Install layer dependencies
print_step "Installing layer dependencies"
npm run install-layers
echo ""

# Check layer sizes
print_step "Checking layer sizes before deployment"
npm run check-layer-sizes
echo ""

# Deploy only the layers
print_step "Deploying Lambda layers"
print_info "This may take a few minutes..."

serverless deploy --config serverless.layers.yml 2>&1 | tee deploy-layers-output.log

if [ $? -eq 0 ]; then
  print_step "Layer deployment completed successfully!"
  
  # Extract layer ARNs from the output
  print_info "Layer ARNs:"
  grep "LayerVersionArn" deploy-layers-output.log
  
  print_step "Next steps:"
  echo "1. Update your serverless.yml with the layer ARNs if needed"
  echo "2. Run npm run deploy to deploy the functions"
else
  print_error "Layer deployment failed. Check the deploy-layers-output.log file for details."
  exit 1
fi 