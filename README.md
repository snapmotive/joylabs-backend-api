# JoyLabs Backend API v3

This repository contains the JoyLabs backend API v3, built with Serverless Framework v4, AWS Lambda, Express, and DynamoDB.

## System Requirements

- Node.js v22.x (required for AWS Lambda Node.js 22.x runtime)
- AWS CLI configured with appropriate credentials
- Serverless Framework v4.10.1 or later

> **Important Update**: This project now requires Node.js 22.x and Serverless Framework v4. Earlier versions are no longer supported.

## New Features & Improvements

- Native environment variable support with Serverless Framework v4
- Enhanced session management with DynamoDB
- Improved Square SDK v42 integration
- AWS SDK v3 for better performance and TypeScript support
- Optimized Lambda cold starts with layer-based architecture

## Layer-Based Architecture

This project uses AWS Lambda Layers to optimize deployment size and improve maintainability. For detailed information on the layer structure and management, see [LAYERS-README.md](LAYERS-README.md).

### Key Benefits

- Smaller function sizes
- Faster deployments
- Better organization of dependencies
- Improved maintainability

## Getting Started

### Prerequisites

1. Install Node.js 22.x:

   ```bash
   # Using nvm (recommended)
   nvm install 22
   nvm use 22
   ```

2. Install Serverless Framework v4:

   ```bash
   npm install -g serverless@4.10.1
   ```

3. Configure AWS CLI with appropriate credentials

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Install layer dependencies:
   ```bash
   npm run install-layers
   ```

### Environment Setup

1. Create a `.env.production` file with required environment variables:
   ```
   NODE_ENV=production
   API_BASE_URL=https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production
   SQUARE_APPLICATION_ID=your_square_app_id
   SESSION_SECRET=your_session_secret
   ```

### Local Development

Start the local development server:

```
npm start
```

This will start a local server using Serverless Offline.

## Deployment

### Deploy All

To deploy the entire service:

```
npm run deploy
```

### Deploy Only Layers

To deploy only the Lambda layers:

```
npm run deploy:layers
```

### Deploy a Specific Function

To deploy a specific function:

```
npm run deploy:function:api     # Deploy API function
npm run deploy:function:catalog # Deploy Catalog function
npm run deploy:function:webhooks # Deploy Webhooks function
npm run deploy:function:oauth    # Deploy OAuth function
```

## Managing Layers

### Check Layer Sizes

To check the sizes of all layers:

```
npm run check-layer-sizes
```

### Create a New Layer

To create a new layer:

```
npm run create:layer <layer-name>
```

Example:

```
npm run create:layer analytics
```

## Project Structure

```
.
├── layers/                  # Lambda layers
│   ├── core/                # Core dependencies used by all functions
│   ├── api-deps/            # API-specific dependencies
│   ├── catalog-deps/        # Catalog-specific dependencies
│   ├── webhooks-deps/       # Webhooks-specific dependencies
│   ├── oauth-deps/          # OAuth-specific dependencies
│   └── square/              # Square SDK
├── scripts/                 # Utility scripts
├── src/                     # Source code
├── serverless.yml           # Main Serverless configuration
├── serverless.layers.yml    # Layers-specific Serverless configuration
└── webpack.config.js        # Webpack configuration
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Overview

This repository contains the serverless backend API for JoyLabs, primarily focused on OAuth integration with Square for mobile applications. The system is built on AWS Lambda with Express.js, using the Serverless Framework for deployment and infrastructure management.

## Architecture

The application follows a serverless architecture pattern:

- **API Gateway**: Handles HTTP requests and routes them to Lambda functions
- **Lambda Functions**: Process API requests, interact with Square API, and manage OAuth flows
- **DynamoDB**: Stores OAuth state parameters, code verifiers, and manages session state
- **AWS Secrets Manager**: Securely stores Square API credentials
- **CloudWatch**: Monitors and logs all Lambda function executions

### Core Components

1. **API Service**: Main Express application handling general API endpoints
2. **OAuth Service**: Specialized Lambda function for Square OAuth authentication
3. **Webhooks Service**: Handles Square webhooks for event notifications

## Dependencies

Primary dependencies (from package.json):

```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.350.0",
    "@aws-sdk/client-secrets-manager": "^3.350.0",
    "@aws-sdk/lib-dynamodb": "^3.350.0",
    "@aws-sdk/util-dynamodb": "^3.350.0",
    "axios": "^1.4.0",
    "body-parser": "^1.20.2",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "crypto": "^1.0.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "serverless-http": "^3.2.0",
    "square": "^42.0.0"
  }
}
```

### Layers

The Lambda functions use two dependency layers to reduce cold start times and package sizes:

1. **dependencies-layer**: Contains all common Node.js dependencies
2. **square-layer**: Contains the Square SDK and related dependencies

## AWS Configuration

### Lambda Functions

Three primary Lambda functions:

1. **api**: Main API service handling general endpoints

   - Handler: `src/index.handler`
   - Environment: `production`
   - Memory: 512 MB
   - Timeout: 30 seconds

2. **oauth**: Specialized function for OAuth processes

   - Handler: `src/oauthHandlers.handler`
   - Environment: `production`
   - Memory: 512 MB
   - Timeout: 30 seconds

3. **webhooks**: Handles Square webhooks
   - Handler: `src/webhooks.handler`
   - Environment: `production`
   - Memory: 512 MB
   - Timeout: 30 seconds

### IAM Permissions

Each Lambda function requires these permissions:

```yaml
- Effect: Allow
  Action:
    - dynamodb:Query
    - dynamodb:Scan
    - dynamodb:GetItem
    - dynamodb:PutItem
    - dynamodb:UpdateItem
    - dynamodb:DeleteItem
  Resource:
    - !GetAtt StatesTable.Arn

- Effect: Allow
  Action:
    - secretsmanager:GetSecretValue
  Resource:
    - !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:square-credentials-*'
```

### DynamoDB Tables

1. **States Table** (`joylabs-backend-api-v3-production-states`):
   - Primary Key: `state` (String)
   - TTL: Enabled on the `ttl` attribute
   - Provisioned Throughput: On-demand
   - Data stored:
     - `state`: OAuth state parameter
     - `code_verifier`: PKCE code verifier
     - `timestamp`: Creation time
     - `ttl`: Time-to-live (expiration)
     - `used`: Whether the state has been used
     - `redirectUrl`: Where to redirect after authentication

### API Gateway

- REST API with custom domain: `gki8kva7e3.execute-api.us-west-1.amazonaws.com`
- Stage: `production`
- CORS enabled for all endpoints
- Binary media types support
- Rate limiting configured for security

## Credentials Management

Square API credentials are stored in AWS Secrets Manager under the name `square-credentials-production`. The secret contains:

```json
{
  "applicationId": "YOUR_SQUARE_APPLICATION_ID",
  "applicationSecret": "YOUR_SQUARE_APPLICATION_SECRET"
}
```

Environment variables required:

```
NODE_ENV=production
API_BASE_URL=https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production
API_GATEWAY_URL=https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production
SQUARE_APPLICATION_ID=YOUR_SQUARE_APPLICATION_ID
SQUARE_APPLICATION_SECRET=YOUR_SQUARE_APPLICATION_SECRET
SQUARE_WEBHOOK_SIGNATURE_KEY=YOUR_SQUARE_WEBHOOK_SIGNATURE_KEY
SQUARE_ENVIRONMENT=production
SQUARE_AUTH_URL=https://connect.squareup.com/oauth2/authorize
SQUARE_TOKEN_URL=https://connect.squareup.com/oauth2/token
SQUARE_CALLBACK_SCHEME=joylabs
SQUARE_CALLBACK_PATH=square-callback
STATES_TABLE=joylabs-backend-api-v3-production-states
JWT_SECRET=YOUR_JWT_SECRET
SESSION_SECRET=YOUR_SESSION_SECRET
LOG_LEVEL=info
```

## OAuth Flow Logic

The system implements the OAuth 2.0 PKCE (Proof Key for Code Exchange) flow for secure authentication with Square from mobile apps.

### Flow Steps

1. **State Registration** (`/api/auth/register-state`)

   - Mobile app generates state and code_verifier
   - App sends state, code_verifier, and redirectUrl to backend
   - Backend stores these in DynamoDB with a 10-minute TTL

2. **OAuth URL Generation** (`/api/auth/connect/url`)

   - Backend generates the Square authorization URL with state and code_challenge
   - URL is returned to the mobile app

3. **Authorization**

   - User is redirected to Square for authorization using the generated URL
   - After authorization, Square redirects to the callback URL with code and state

4. **Callback Handling** (`/api/auth/square/callback`)

   - Backend receives code and state from Square
   - Retrieves state data from DynamoDB to verify state and get code_verifier
   - Exchanges code for access tokens using code_verifier
   - Retrieves merchant info with the access token
   - Marks state as used in DynamoDB
   - Redirects to mobile app with tokens using custom URL scheme

5. **Token Usage in App**
   - Mobile app receives tokens via deep link
   - App uses tokens for Square API requests

### PKCE Implementation Details

For security, we use PKCE flow which is critical for mobile apps:

1. **Code Verifier**: A cryptographically random string generated on the mobile app

   - 43-128 characters long
   - URL-safe characters only (A-Z, a-z, 0-9, hyphen, period, underscore, tilde)

2. **Code Challenge**: Derived from the code verifier

   - SHA-256 hash of the code verifier
   - Base64 URL encoded

3. **State Parameter**: Another random string to prevent CSRF attacks

   - Stored with code verifier in DynamoDB
   - Validated during callback

4. **Deep Link Handling**:
   - Tokens are returned to the app via `joylabs://square-callback` URL scheme
   - Parameters include `access_token`, `refresh_token`, `merchant_id`, and `business_name`

## Mobile App Integration

The mobile app needs to implement the following:

1. **Generate State and Code Verifier**:

   ```javascript
   function generateCodeVerifier() {
     const array = new Uint8Array(32);
     crypto.getRandomValues(array);
     return base64UrlEncode(array);
   }

   function generateState() {
     const array = new Uint8Array(32);
     crypto.getRandomValues(array);
     return base64UrlEncode(array);
   }
   ```

2. **Compute Code Challenge**:

   ```javascript
   async function generateCodeChallenge(codeVerifier) {
     const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
     return base64UrlEncode(new Uint8Array(hash));
   }
   ```

3. **Register State**:

   ```javascript
   await fetch(
     'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/register-state',
     {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         state: state,
         code_verifier: codeVerifier,
         redirectUrl: 'joylabs://square-callback',
       }),
     }
   );
   ```

4. **Get Authorization URL**:

   ```javascript
   const response = await fetch(
     `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/connect/url?state=${state}&code_challenge=${codeChallenge}&redirect_uri=joylabs://square-callback`
   );
   const { url } = await response.json();
   // Open URL in browser/WebView
   ```

5. **Handle Deep Link Callback**:
   ```javascript
   function handleDeepLink(url) {
     if (url.startsWith('joylabs://square-callback')) {
       const params = new URLSearchParams(url.split('?')[1]);
       const accessToken = params.get('access_token');
       const refreshToken = params.get('refresh_token');
       const merchantId = params.get('merchant_id');
       const businessName = params.get('business_name');

       // Store tokens securely
       // Update app state for authenticated user
     }
   }
   ```

## Debugging and Troubleshooting

### Logging

All Lambda functions log to CloudWatch with structured logging:

- Request details
- State registration
- Token exchange
- Callback processing
- Redirect URL construction

Example log query for tracing an OAuth flow:

```
filter @message like "Square callback received"
| sort @timestamp desc
| limit 20
```

### Common Issues

1. **Invalid State Parameter**

   - Cause: State not registered or expired in DynamoDB
   - Solution: Ensure state is registered before starting OAuth flow

2. **Missing Code Verifier**

   - Cause: Code verifier not stored with state
   - Solution: Include code_verifier when registering state

3. **URL Scheme Handling**

   - Cause: Mobile app not correctly configured for deep linking
   - Solution: Ensure proper configuration in `Info.plist` (iOS) or `AndroidManifest.xml` (Android)

4. **DynamoDB Throughput**
   - Cause: Exceeded provisioned capacity
   - Solution: Monitor and adjust capacity or switch to on-demand

## Contact

For support or questions, contact support@joylabs.com

---

_This documentation is maintained by the JoyLabs Backend Team_

## Recent Updates

- **Node.js 22 Migration**: The codebase has been updated to run on Node.js 22. See [Node.js 22 Migration Guide](docs/nodejs22-migration.md) for details.
- **Square SDK v42**: Updated from v35.1.0 to v42.0.0. API property access patterns have been updated across the codebase.
