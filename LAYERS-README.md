# Lambda Layer Optimization Guide

This document outlines our approach to optimizing Lambda function size using a structured layering system.

## Layer Structure

We've organized dependencies into function-specific layers to keep each Lambda function smaller and more maintainable:

1. **Core Layer** (`layers/core`)
   - Contains common dependencies used by all functions
   - Includes: express, serverless-http, basic AWS SDK modules, etc.

2. **Function-specific Layers**
   - `layers/api-deps`: Dependencies used only by the API function
   - `layers/catalog-deps`: Dependencies used only by the Catalog function
   - `layers/webhooks-deps`: Dependencies used only by the Webhooks function
   - `layers/oauth-deps`: Dependencies used only by the OAuth function
   
3. **Square Layer** (`layers/square`)
   - Contains the Square SDK isolated in its own layer

## Deployment Process

1. **Install Layer Dependencies**
   ```
   npm run install-layers
   ```
   This script installs all required dependencies for each layer.

2. **Check Layer Sizes**
   ```
   npm run check-layer-sizes
   ```
   Verifies that layers are within AWS Lambda limits.

3. **Full Deployment**
   ```
   npm run deploy
   ```
   Installs layer dependencies, checks sizes, and deploys the application.

## Webpack Configuration

Our webpack configuration is optimized to:
- Exclude all layer dependencies from the function bundles
- Minify code while preserving function names
- Split chunks when appropriate to further reduce size

## Size Limits

AWS Lambda has the following limits:
- 250MB maximum deployment package size (function + layers)
- 50MB maximum for a single function
- 5 layers maximum per function

Our layering approach helps stay within these limits by:
- Keeping each function small by moving dependencies to layers
- Avoiding duplicate dependencies across layers
- Optimizing the webpack bundle

## Troubleshooting

If you encounter size-related issues:

1. **Check layer sizes**:
   ```
   npm run check-layer-sizes
   ```

2. **Review dependencies**:
   - Check if dependencies are in the correct layer
   - Look for redundant dependencies
   - Consider if a specific dependency can be removed

3. **Webpack optimization**:
   - Verify that webpack is correctly excluding layer dependencies
   - Use the `--verbose` flag with `serverless deploy` to see detailed packaging info

## Adding New Dependencies

When adding new dependencies:

1. Determine which functions need the dependency
2. Add it to the appropriate layer's `package.json`
3. Update the webpack config if needed to exclude the dependency
4. Run `npm run install-layers` to update the layers

## Guidelines

- Keep each function focused on a specific task
- Move dependencies used by multiple functions to the core layer
- Use the smallest, most efficient libraries possible
- Always run size checks before deploying 