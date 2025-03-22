# JoyLabs Backend API

AWS Serverless backend API for JoyLabs Catalogue App with Square OAuth integration.

## Overview

This project provides a serverless backend API for the JoyLabs mobile app, handling authentication, Square integration, and data management using AWS Lambda, API Gateway, and DynamoDB.

## Technology Stack

- **AWS Lambda** - Serverless compute service
- **API Gateway** - API management and routing
- **DynamoDB** - NoSQL database for persistent storage
- **Serverless Framework** - Infrastructure as code for AWS deployment
- **Express.js** - Web framework for the API
- **Square SDK** - Integration with Square for payments and merchant data

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- AWS CLI configured with appropriate credentials
- Serverless Framework CLI
- Square Developer account

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/joylabs/joylabs-backend.git
   cd joylabs-backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration values.

4. Install the Serverless Framework:
   ```
   npm install -g serverless
   ```

### Local Development

1. Start the local development server:
   ```
   npm run dev
   ```

2. Test the Square OAuth flow locally:
   ```
   npm run test:oauth
   ```

3. Run tests:
   ```
   npm test
   ```

## Deployment

### Deploy to AWS

1. Configure your AWS credentials:
   ```
   aws configure
   ```

2. Deploy using the provided script:
   ```
   ./deploy-aws.sh
   ```

   Or manually with:
   ```
   npm run deploy:prod
   ```

3. Update your Square Developer Console with the deployed callback URL.

## API Endpoints

### Authentication

- `GET /api/auth/square/init` - Initialize Square OAuth flow
- `GET /api/auth/square/callback` - Handle Square OAuth callback
- `GET /api/auth/square/mobile-init` - Initialize Square OAuth flow for mobile apps (with PKCE)
- `GET /api/auth/square/mobile-callback` - Handle Square OAuth callback for mobile apps

### Square Webhooks

- `POST /api/webhooks/square` - Handle Square webhook events

### Health Check

- `GET /api/health` - API health check endpoint

## Configuration

### Environment Variables

Key environment variables:

- `NODE_ENV` - Environment (development, production)
- `STAGE` - Deployment stage (dev, production)
- `SQUARE_ENVIRONMENT` - Square API environment (sandbox, production)
- `SQUARE_APPLICATION_ID` - Square application ID
- `SQUARE_REDIRECT_URL` - OAuth callback URL
- `REGION` - AWS region
- `USERS_TABLE` - DynamoDB table for users
- `SESSIONS_TABLE` - DynamoDB table for sessions
- `SQUARE_CREDENTIALS_SECRET` - AWS Secrets Manager secret name for Square credentials
- `FRONTEND_URL` - Frontend application URL for redirects
- `LOG_LEVEL` - Logging level

### AWS Resources

The Serverless Framework automatically creates:

- Lambda functions
- API Gateway endpoints
- DynamoDB tables
- IAM roles and policies
- CloudWatch Log Groups

## Security

- JWT authentication for protected endpoints
- PKCE (Proof Key for Code Exchange) for mobile OAuth flow
- AWS IAM for resource access control
- Rate limiting on API endpoints
- HTTPS for all communications

## Testing

Run the test suite:

```
npm test
```

## License

Proprietary - All rights reserved

## Architecture

### Lambda Functions

The backend is organized into three separate Lambda functions, each with its own specific responsibility:

1. **API Function** - Handles all general API requests, routed through Express.
2. **Square OAuth Callback Function** - Dedicated to handling Square OAuth callback requests.
3. **Square Webhook Function** - Dedicated to processing webhook events from Square.

### Lambda Layers

To optimize the deployment package size and improve performance, the project uses Lambda Layers to separate dependencies:

1. **Dependencies Layer** - Contains common dependencies like Express, AWS SDK, and utilities.
2. **Square Layer** - Contains Square-specific dependencies, which can be quite large.

This architecture provides several benefits:
- Faster Lambda cold starts due to smaller deployment packages
- Simplified dependency management
- Better separation of concerns

### Setting Up Layers

To set up the Lambda layers locally, run:

```
npm run setup-layers
```

This will install all dependencies in the appropriate layer directories.

---

For more information, refer to the detailed documentation in the `docs/` directory. 