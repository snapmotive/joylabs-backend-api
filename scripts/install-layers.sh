#!/bin/bash
set -e

# Ensure directories exist
mkdir -p layers/core/nodejs
mkdir -p layers/api-deps/nodejs
mkdir -p layers/catalog-deps/nodejs
mkdir -p layers/webhooks-deps/nodejs
mkdir -p layers/oauth-deps/nodejs
mkdir -p layers/square/nodejs

# Install dependencies for core layer
echo "Installing core dependencies..."
cd layers/core/nodejs
npm install --production
cd ../../..

# Install dependencies for API layer
echo "Installing API dependencies..."
cd layers/api-deps/nodejs
npm install --production
cd ../../..

# Install dependencies for catalog layer
echo "Installing catalog dependencies..."
cd layers/catalog-deps/nodejs
npm install --production
cd ../../..

# Install dependencies for webhooks layer
echo "Installing webhooks dependencies..."
cd layers/webhooks-deps/nodejs
npm install --production
cd ../../..

# Install dependencies for OAuth layer
echo "Installing OAuth dependencies..."
cd layers/oauth-deps/nodejs
npm install --production
cd ../../..

# Install dependencies for Square layer
echo "Installing Square dependencies..."
cd layers/square/nodejs
npm install --production
cd ../../..

echo "All layer dependencies installed successfully!" 