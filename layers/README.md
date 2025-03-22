# Lambda Layers

This directory contains Lambda Layers used in the JoyLabs backend. Lambda Layers are a way to package and share code that is used across multiple Lambda functions, reducing duplication and deployment package sizes.

## Structure

- `dependencies/` - Contains common dependencies like Express, AWS SDK, etc.
- `square/` - Contains the Square SDK and related dependencies

## Directory Structure

Each layer follows the same structure:

```
layers/
├── dependencies/
│   └── nodejs/
│       └── package.json
└── square/
    └── nodejs/
        └── package.json
```

When a layer is deployed, AWS Lambda looks for a `nodejs` folder (for Node.js runtimes) and includes all the contents in the Lambda execution environment.

## Setup

To set up the layers, run:

```bash
npm run setup-layers
```

This script will install all dependencies for each layer in the appropriate directory.

## Deployment

The layers are deployed automatically when you run:

```bash
npm run deploy:dev
# or
npm run deploy:prod
```

## Benefits

Using Lambda Layers provides several benefits:

1. **Smaller deployment packages** - Reduces the size of your Lambda function deployment package, leading to faster deployments
2. **Faster cold starts** - Smaller packages can lead to faster cold starts
3. **Dependency management** - Easier to update shared dependencies
4. **Simplified development** - Keep your function code focused on business logic

## Troubleshooting

If you encounter any issues with the layers:

1. Verify that all required dependencies are installed
2. Check that the layer structure follows AWS requirements
3. Confirm that the layer is being referenced correctly in the serverless.yml file 