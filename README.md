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

## API Versioning Strategy

The JoyLabs API follows a consistent URL pattern using the `/api/*` prefix for all endpoints, which decouples our API structure from Square's versioning.

### Square API Versioning

- Square uses `/v2/*` endpoints in their API (e.g., `/v2/locations`)
- Our services internally track Square's API version (currently v2)
- We handle version translation internally in service files

This approach offers several advantages:

1. Frontend applications use a consistent `/api/*` pattern
2. We can update Square API versions (v2 → v3) without changing frontend code
3. We maintain full control over our API evolution independent of Square

### Implementation Details

Square API version is centralized in each service file:

```javascript
// In service files (e.g., src/services/location.js)
const SQUARE_API_VERSION = 'v2';
```

This makes future version migrations easier to manage and test.

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

##GOALS FO ROUR FRONTEND:
Square Catalog Management Flow for My App
I'll explain how My App should handle the catalog when downloading, updating, and modifying items. This flow is essential for understanding how product information moves between Square's servers and your custom catalog management application.
Initial Catalog Download
When My App first connects to a Square account:

My App authenticates with Square's servers using account credentials
My App requests the catalog data via Square's Catalog API
The server returns a complete snapshot of the catalog including:

Items and item variations
Categories
Modifiers and modifier lists
Taxes
Discounts

This data is stored locally in My App's database
My App establishes a version reference point (catalog version)

Updating the Catalog
When changes are made to the catalog (either through Dashboard or other means):

Square's server assigns a new version ID to the updated catalog
My App periodically polls the server to check if its local version is current
If a new version is available, My App requests only the delta (changes) since its current version
The server sends only modified records rather than the entire catalog
My App applies these changes to its local database
The local version reference is updated to match the server

Making Modifications from My App
When you modify the catalog directly from My App:

My App captures the changes in a local transaction
The changes are immediately applied to the local database for instant visibility
The changes are queued for synchronization with the server
My App sends the changes to the server when connectivity is available
The server processes the changes and assigns a new catalog version
My App updates its version reference when confirmation is received

Conflict Resolution
If simultaneous changes occur from multiple sources:

The server applies a "last write wins" policy for most conflicts
If My App made changes while offline, they're synchronized when connectivity returns
If server changes occurred while My App was offline, My App downloads them during reconnection
My App prioritizes server changes in conflict situations
Some critical fields may have special conflict resolution rules to prevent data loss

Offline Functionality
When My App operates offline:

The app continues using its locally stored catalog
Modifications are stored locally and queued for synchronization
Upon reconnection, My App first sends pending changes to the server
Then My App downloads any server-side changes that occurred while offline
The local database is reconciled with the server version

This flow ensures that your catalog stays consistent across all devices while allowing for flexible operations even when connectivity is limited.

## Frontend Catalog Synchronization Guide

### Introduction

This guide outlines the process for a React Native frontend application to download the entire merchant catalog from the JoyLabs backend API and store it locally in an EXPO SQLite database. The backend acts as a proxy to the Square Catalog API, providing a consistent interface (`/api/*`) regardless of Square's underlying API version.

### Backend API Overview

1.  **Base URL**: `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production`
2.  **Authentication**: All requests to protected endpoints require a JSON Web Token (JWT) provided in the `Authorization` header.
    ```
    Authorization: Bearer <YOUR_JWT_TOKEN>
    ```
    Ensure your frontend authentication flow provides this token before attempting catalog sync.
3.  **Endpoint Naming**: All JoyLabs backend endpoints follow the `/api/*` convention.
4.  **Relevant Endpoint**: `GET /api/catalog/list`
5.  **Square API Versioning**: The backend internally handles interactions with Square's `v2` API, currently using the `2025-03-19` API version header. The frontend does **not** need to worry about Square's `/v2` paths or specific version headers; use the JoyLabs `/api/*` endpoints.

### Catalog Retrieval Process (`GET /api/catalog/list`)

To download the entire catalog, which can be large (18,000+ items), you must use pagination. The backend API endpoint `GET /api/catalog/list` proxies Square's `ListCatalog` functionality, which uses cursor-based pagination.

#### Request Parameters

- `limit` (optional, integer): The maximum number of objects to return per page. The backend now defaults to **1000** and caps the requested value at 1000. Requesting up to 1000 per page is recommended for faster initial sync, but monitor performance.
- `cursor` (optional, string): The pagination cursor returned from the previous request. Omit this for the _first_ request.
- `types` (optional, string): Comma-separated list of `CatalogObject` types to retrieve (e.g., `ITEM,CATEGORY,MODIFIER_LIST,MODIFIER,TAX,DISCOUNT,IMAGE`). If omitted, the backend defaults to `ITEM,CATEGORY`. For a full sync, you likely want most, if not all, available types.

**Example Initial Request (Requesting max limit):**

```http
GET /api/catalog/list?limit=1000&types=ITEM,CATEGORY,MODIFIER_LIST,MODIFIER,TAX,DISCOUNT,IMAGE HTTP/1.1
Host: gki8kva7e3.execute-api.us-west-1.amazonaws.com
Authorization: Bearer <YOUR_JWT_TOKEN>
```

**Example Subsequent Request (Requesting max limit):**

```http
GET /api/catalog/list?limit=1000&types=ITEM,CATEGORY,MODIFIER_LIST,MODIFIER,TAX,DISCOUNT,IMAGE&cursor=CURSOR_VALUE_FROM_PREVIOUS_RESPONSE HTTP/1.1
Host: gki8kva7e3.execute-api.us-west-1.amazonaws.com
Authorization: Bearer <YOUR_JWT_TOKEN>
```

#### Success Response (200 OK)

The backend will return a JSON object with the following structure:

```json
{
  "success": true,
  "objects": [
    // Array of Square CatalogObjects
    {
      "type": "ITEM",
      "id": "SQUARE_ITEM_ID_1",
      "updated_at": "2024-04-03T10:00:00Z",
      "version": 1617444000000,
      "is_deleted": false,
      "present_at_all_locations": true,
      "item_data": {
        "name": "Coffee",
        "description": "...",
        "abbreviation": "Cof",
        "category_id": "CATEGORY_ID",
        "tax_ids": ["TAX_ID_1"],
        "variations": [
          {
            "type": "ITEM_VARIATION",
            "id": "ITEM_VARIATION_ID_1",
            // ... other variation data
            "item_variation_data": {
              "item_id": "SQUARE_ITEM_ID_1",
              "name": "Small",
              "sku": "COF-SML",
              "pricing_type": "FIXED_PRICING",
              "price_money": {
                "amount": 300,
                "currency": "USD"
              }
              // ... other variation pricing data
            }
          }
        ],
        "modifier_list_info": [
          {
            "modifier_list_id": "MODIFIER_LIST_ID_1",
            "enabled": true
            // ... other modifier info
          }
        ],
        "image_ids": ["IMAGE_ID_1"]
        // ... other item data
      }
    },
    {
      "type": "CATEGORY",
      "id": "CATEGORY_ID"
      // ... category data
    },
    {
      "type": "MODIFIER_LIST",
      "id": "MODIFIER_LIST_ID_1"
      // ... modifier list data
    }
    // ... more objects
  ],
  "cursor": "NEXT_PAGE_CURSOR_VALUE" // Present if more pages exist, absent/null otherwise
}
```

**Key Fields:**

- `success`: Always `true` for successful requests.
- `objects`: An array containing the fetched `CatalogObject` instances.
- `cursor`: A string token. If present, use this value in the `cursor` query parameter of your next request to fetch the subsequent page. If absent or null, you have reached the end of the catalog.

#### Error Response (4xx/5xx)

If an error occurs, the backend returns:

```json
{
  "success": false,
  "message": "Error description (e.g., Failed to list catalog items)",
  "error": {
    // May contain more specific Square error details
    "code": "SQUARE_ERROR_CODE", // e.g., "UNAUTHORIZED", "RATE_LIMITED"
    "detail": "More detailed error message from Square",
    "category": "SQUARE_ERROR_CATEGORY" // e.g., "AUTHENTICATION_ERROR"
  }
  // Or sometimes just a simpler error string:
  // "error": "Error details string"
}
```

**Common Errors:**

- **401 Unauthorized**: Invalid or missing JWT token.
- **429 Too Many Requests**: Backend rate limit hit. Implement exponential backoff and retry.
- **5xx Server Error**: An issue occurred on the backend. Retry after a delay.

### Frontend Implementation Strategy

1.  **Prerequisites**:

    - React Native project setup (likely with Expo).
    - SQLite library (e.g., `expo-sqlite`).
    - Authentication flow implemented to obtain a JWT.
    - API client (e.g., `axios` or native `fetch`).

2.  **Database Schema**: Design your local SQLite schema to store the catalog data. You'll likely need tables for:

    - `items`
    - `item_variations`
    - `categories`
    - `modifier_lists`
    - `modifiers`
    - `taxes`
    - `discounts`
    - `images`
    - Consider tables for relationships (e.g., `item_modifier_lists`, `item_taxes`).
    - Store the Square `id`, `version`, and `updated_at` timestamps for potential future delta syncs.

3.  **Fetching Logic (Pagination Loop)**:

    - Initialize `cursor = null`.
    - Start a loop (e.g., `do...while(cursor)`).
    - Inside the loop:
      - Construct the API request URL: `GET /api/catalog/list`. Add `limit` and desired `types`. If `cursor` is not null, add `&cursor={cursor}`.
      - Make the authenticated API call.
      - **Handle Errors**: Check for non-200 responses. Implement retry logic, especially exponential backoff for 429 errors. Log errors. If an unrecoverable error occurs (like 401), stop the sync.
      - **Process Success Response**:
        - Extract the `objects` array and the new `cursor` value from the response data.
        - Store/Update the `objects` in your SQLite database (see next step).
        - Update the `cursor` variable with the value from the response.
    - The loop continues as long as the `cursor` returned is not null or empty.

4.  **Data Processing and Storage**:

    - Iterate through the `objects` array received in each API response.
    - Use the `type` field of each object to determine which SQLite table to insert/update data into.
    - **Use Transactions**: Wrap database insertions/updates for each page of objects within a single SQLite transaction for significantly better performance.
    - **Upsert Logic**: Implement an "upsert" (update or insert) mechanism. Check if a record with the Square `id` already exists in your local table. If yes, update it (potentially checking the `version` or `updated_at` timestamp). If no, insert a new record.

5.  **Background Task**: Downloading 18,000+ items will take time. Perform this synchronization in a background task/thread to avoid blocking the UI. Use libraries like `expo-task-manager` or dedicated background job libraries.

6.  **UI/UX**:

    - Provide clear feedback to the user that a background sync is in progress (e.g., a loading indicator, progress bar - though estimating total progress is tricky with cursors).
    - Notify the user upon completion or if an unrecoverable error occurs.
    - Consider allowing the user to trigger the sync manually or schedule it periodically.

7.  **Performance & Memory**:
    - Processing large arrays of objects can consume memory. Process data in chunks if necessary.
    - Ensure your SQLite queries are optimized. Use indexes on frequently queried columns (like `id`).
    - Batch database operations within transactions.

### Conceptual Code Example (React Native Fetch Loop)

```javascript
import * as SQLite from 'expo-sqlite';
import axios from 'axios'; // Or use fetch

const API_BASE_URL = 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production';
const DB_NAME = 'catalog.db';

// --- Database Setup (Simplified) ---
async function openDatabase() {
  // Check if DB exists, create tables if not
  // ...
  return SQLite.openDatabase(DB_NAME);
}

async function storeObjectsInDB(db, objects) {
  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        objects.forEach(obj => {
          // --- IMPORTANT: Implement robust UPSERT logic here ---
          // Based on obj.type, insert/update into the correct table
          // Example for items (highly simplified):
          if (obj.type === 'ITEM') {
            tx.executeSql(
              `INSERT OR REPLACE INTO items (id, version, name, data_json) VALUES (?, ?, ?, ?);`,
              [obj.id, obj.version, obj.item_data?.name || 'Unknown', JSON.stringify(obj)],
              () => {}, // Success callback per statement
              (_, error) => {
                console.error('SQLite Insert/Replace Error:', error);
                // Returning true rolls back the transaction
                return true;
              }
            );
          }
          // Add similar logic for CATEGORY, MODIFIER_LIST, etc.
        });
      },
      error => {
        // Transaction error
        console.error('SQLite Transaction Error:', error);
        reject(error);
      },
      () => {
        // Transaction success
        resolve();
      }
    );
  });
}

// --- Sync Function ---
async function syncFullCatalog(authToken) {
  const db = await openDatabase();
  let cursor = null;
  let page = 1;
  const limit = 200; // Adjust as needed
  const typesToFetch = 'ITEM,CATEGORY,MODIFIER_LIST,MODIFIER,TAX,DISCOUNT,IMAGE'; // Be specific

  console.log('Starting full catalog sync...');

  try {
    do {
      console.log(`Fetching page ${page}... Cursor: ${cursor ? 'Present' : 'None'}`);
      const params = {
        limit: limit,
        types: typesToFetch,
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await axios.get(`${API_BASE_URL}/api/catalog/list`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: params,
      });

      if (response.data && response.data.success) {
        const objects = response.data.objects || [];
        const nextCursor = response.data.cursor;

        console.log(
          `Received ${objects.length} objects. Next cursor: ${nextCursor ? 'Present' : 'None'}`
        );

        if (objects.length > 0) {
          // Store fetched objects in the database within a transaction
          await storeObjectsInDB(db, objects);
          console.log(`Stored ${objects.length} objects from page ${page}.`);
        }

        cursor = nextCursor; // Update cursor for the next iteration
        page++;
      } else {
        console.error('API Error:', response.data?.message || 'Unknown API error');
        throw new Error(response.data?.message || 'Catalog sync failed');
      }

      // Optional: Add a small delay between requests to be kind to the API
      // await new Promise(resolve => setTimeout(resolve, 200));
    } while (cursor);

    console.log('Full catalog sync completed successfully!');
  } catch (error) {
    console.error('Catalog Sync Failed:', error);
    if (error.response) {
      // Handle specific HTTP errors (401, 429, 5xx)
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
      // Implement retry logic for 429/5xx here
    }
    // Notify user or log error appropriately
  }
}

// --- Usage ---
// const token = getMyAuthToken();
// syncFullCatalog(token); // Run this in a background task
```

### Important Considerations

- **Delta Syncs**: This guide covers a _full_ sync using the `GET /api/catalog/list` endpoint. For subsequent, more efficient updates (delta syncs), the backend would ideally expose functionality proxying Square's `SearchCatalogObjects` API, allowing filtering by `begin_time`. Alternatively, reacting to `catalog.version.updated` webhooks combined with `BatchRetrieveCatalogObjects` is another strategy, though this requires backend webhook processing. Discuss with the backend team if delta sync functionality via `SearchCatalogObjects` is available or planned.
- **Error Robustness**: Build robust error handling and retry mechanisms, especially for network issues and rate limiting (429).
- **Data Consistency**: Ensure your database schema and upsert logic correctly handle relationships between different catalog object types (e.g., items linking to categories, variations linking to items, modifiers linking to modifier lists).
- **Testing**: Test thoroughly with a smaller dataset first, then scale up. Monitor memory usage and performance during the sync process.

## Backend Endpoints for Frontend Sync

Here are the primary backend API endpoints the frontend will use for catalog synchronization:

1.  **Get Authenticated Merchant Info**: `GET /api/merchant/me`

    - **Purpose**: Retrieve details about the currently authenticated merchant (business name, ID, country, etc.). Useful for initializing user context.
    - **Authentication**: Required (Bearer Token).
    - **Response**: `{ success: true, merchant: { merchantId: '...', businessName: '...', ... } }`

2.  **List Catalog Objects (Full Sync)**: `GET /api/catalog/list`

    - **Purpose**: Download the entire catalog initially or perform a full refresh.
    - **Authentication**: Required (Bearer Token).
    - **Query Parameters**: `limit` (up to 1000), `cursor` (for pagination), `types` (comma-separated list, e.g., `ITEM,CATEGORY,IMAGE`).
    - **Response**: `{ success: true, objects: [...], cursor: '...' }` (See previous detailed example).

3.  **Search Catalog Objects (Delta Sync)**: `POST /api/catalog/search`

    - **Purpose**: Fetch only catalog objects updated since the last sync time.
    - **Authentication**: Required (Bearer Token).
    - **Request Body**: Square `SearchCatalogObjects` request body. Crucially, include the `begin_time` field set to the timestamp (ISO 8601 format) of the last successful sync.

    ```json
    {
      "object_types": ["ITEM", "CATEGORY", "MODIFIER_LIST", "MODIFIER", "TAX", "DISCOUNT", "IMAGE"],
      "include_deleted_objects": true, // Important to capture deletions
      "include_related_objects": true,
      "begin_time": "2024-04-07T22:00:00Z", // Timestamp of last sync
      "limit": 1000 // Can also paginate search results if needed
    }
    ```

    - **Response**: `{ success: true, objects: [...], cursor: '...', related_objects: [...] }` (Mirrors Square's `SearchCatalogObjects` response). Also includes `deleted_object_ids` if `include_deleted_objects` was true.

4.  **Upsert (Create/Update) Catalog Object**: `POST /api/catalog/item`

    - **Purpose**: Push local creations or modifications to Square.
    - **Authentication**: Required (Bearer Token).
    - **Request Body**: A single `CatalogObject` structure representing the item/category/etc. to create or update. For updates, include the correct `version` obtained from a previous fetch.

    ```json
    {
      "idempotency_key": "unique-frontend-generated-key",
      "object": {
        "type": "ITEM",
        "id": "#new-item-id" // Use # prefix for creation
        // OR "id": "EXISTING_SQUARE_ID" for update
        // "version": 1617444000000, // REQUIRED for updates
        "item_data": { ... }
      }
    }
    ```

    - **Response**: `{ success: true, catalog_object: { ... }, id_mappings: [...] }` (Mirrors Square's `UpsertCatalogObject` response).

5.  **Delete Catalog Object**: `DELETE /api/catalog/item/:id`

    - **Purpose**: Delete an object from Square based on local actions.
    - **Authentication**: Required (Bearer Token).
    - **URL Parameter**: `:id` is the Square `CatalogObject` ID to delete.
    - **Response**: `{ success: true, deleted_object_ids: ['...'], deleted_at: '...' }` (Mirrors Square's `DeleteCatalogObject` response).

6.  **Retrieve Single Catalog Object**: `GET /api/catalog/item/:id`

    - **Purpose**: Fetch the latest version of a specific item, often needed after a `VERSION_MISMATCH` error during an update attempt.
    - **Authentication**: Required (Bearer Token).
    - **URL Parameter**: `:id` is the Square `CatalogObject` ID to retrieve.
    - **Response**: `{ success: true, catalogObject: { ... }, relatedObjects: [...] }`

7.  **List Locations**: `GET /api/locations`
    - **Purpose**: Get a list of the merchant's configured business locations.
    - **Authentication**: Required (Bearer Token).
    - **Response**: `{ success: true, locations: [{ id: '...', name: '...', ... }] }`
