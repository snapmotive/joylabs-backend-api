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
  echo "Usage: $0 <layer-name>"
  echo ""
  echo "Example: $0 analytics"
  echo ""
  echo "This will create a new layer structure at 'layers/analytics-deps'"
  exit 1
}

# Check if a layer name is provided
if [ "$#" -ne 1 ]; then
  print_error "No layer name provided"
  usage
fi

LAYER_NAME=$1
LAYER_DIR="layers/${LAYER_NAME}-deps"

# Check if the layer already exists
if [ -d "$LAYER_DIR" ]; then
  print_error "Layer directory already exists: $LAYER_DIR"
  exit 1
fi

# Create the layer directory structure
print_step "Creating layer structure for: ${LAYER_NAME}"
mkdir -p "$LAYER_DIR/nodejs"

# Create the package.json file
print_step "Creating package.json for the layer"
cat > "$LAYER_DIR/nodejs/package.json" << EOF
{
  "name": "joylabs-${LAYER_NAME}-dependencies",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    // Add your dependencies here
  }
}
EOF

print_info "Layer directory structure created at: $LAYER_DIR"
print_info "Next steps:"
echo "1. Add your dependencies to $LAYER_DIR/nodejs/package.json"
echo "2. Run 'cd $LAYER_DIR/nodejs && npm install --production'"
echo "3. Update webpack.config.js to exclude your new dependencies"
echo "4. Update serverless.layers.yml to include your new layer"
echo "5. Deploy your layer with './scripts/deploy-layers.sh'"

# Help with webpack config
print_step "Adding template for webpack.config.js updates"
echo ""
echo "Add this to webpack.config.js:"
echo ""
echo "const ${LAYER_NAME}DepsModules = ["
echo "  // Add your layer dependencies here"
echo "];"
echo ""
echo "// Update the allLayerModules array to include the new modules:"
echo "const allLayerModules = ["
echo "  ...coreLayerModules,"
echo "  ...apiDepsModules,"
echo "  ...${LAYER_NAME}DepsModules,"
echo "  // other layer modules..."
echo "];"
echo ""

# Help with serverless.layers.yml
print_step "Adding template for serverless.layers.yml updates"
echo ""
echo "Add this to serverless.layers.yml under the 'layers:' section:"
echo ""
echo "  ${LAYER_NAME}-deps:"
echo "    path: layers/${LAYER_NAME}-deps"
echo "    name: \${self:service}-${LAYER_NAME}-deps-\${opt:stage, 'production'}"
echo "    description: ${LAYER_NAME^} specific dependencies"
echo "    compatibleRuntimes:"
echo "      - nodejs18.x"
echo "    retain: true" 