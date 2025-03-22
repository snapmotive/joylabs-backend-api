#!/bin/bash
# Script to install Lambda layer dependencies

echo "Setting up Lambda layers dependencies..."

# Set up dependencies layer
cd layers/dependencies/nodejs
npm install --production
cd ../../..

# Set up Square layer
cd layers/square/nodejs
npm install --production
cd ../../..

echo "Lambda layers dependencies installed!" 