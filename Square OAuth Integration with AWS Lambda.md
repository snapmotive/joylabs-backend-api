# Square OAuth Integration with AWS Lambda - Implementation Guide

## Table of Contents
1. Prerequisites
2. Architecture Overview
3. Step-by-Step Implementation
4. Common Pitfalls and Solutions
5. Testing Guide
6. Security Considerations
7. Maintenance Guide

## 1. Prerequisites

### Square Developer Account Setup
1. Create account at developer.squareup.com
2. Create new application
3. Note your:
   - Application ID (starts with sq0idp-)
   - Application Secret (starts with sq0csp-)
4. Configure OAuth settings:
   - Redirect URL format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/api/auth/square/callback
   - Permissions needed: 
     - MERCHANT_PROFILE_READ
     - PAYMENTS_READ
     - ORDERS_READ
     (Add more as needed)

### AWS Setup
1. AWS Account with access to:
   - Lambda
   - DynamoDB
   - Secrets Manager
   - API Gateway
   - Parameter Store
2. AWS CLI configured
3. Node.js 18.x installed
4. Serverless Framework installed

## 2. Architecture Overview

### Components
1. **AWS Lambda Functions**
   ```
   /src
   ├── oauthHandlers.js      # OAuth callback and success handlers
   ├── services/
   │   └── square.js         # Square API integration
   └── models/
       └── user.js           # User data management
   ```

2. **DynamoDB Tables**
   ```yaml
   UsersTable:
     Properties:
       AttributeDefinitions:
         - AttributeName: id
           AttributeType: S
         - AttributeName: square_merchant_id
           AttributeType: S
       GlobalSecondaryIndexes:
         - IndexName: SquareMerchantIndex
           KeySchema:
             - AttributeName: square_merchant_id
               KeyType: HASH
   ```

3. **AWS Secrets**
   - Parameter Store: `/joylabs/{stage}/JWT_SECRET`
   - Secrets Manager: `square-credentials-{stage}`

## 3. Step-by-Step Implementation

### Step 1: Project Setup
```bash
# Initialize project
npm init -y

# Install dependencies
npm install express serverless-http @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb 
npm install jsonwebtoken axios cookie-parser
```

### Step 2: Configure Serverless.yml
```yaml
service: joylabs-backend-api

provider:
  name: aws
  runtime: nodejs18.x
  stage: ${opt:stage, 'dev'}
  environment:
    NODE_ENV: ${opt:stage, 'dev'}
    USERS_TABLE: joylabs-catalog-users-${self:provider.stage}
    JWT_SECRET: ${ssm:/joylabs/${self:provider.stage}/JWT_SECRET}
    SQUARE_CREDENTIALS_SECRET: !Ref SquareCredentialsSecret
    SQUARE_REDIRECT_URL: ${env:SQUARE_REDIRECT_URL}
    API_BASE_URL: ${env:API_BASE_URL}

functions:
  squareCallback:
    handler: src/oauthHandlers.squareCallback
    events:
      - http:
          path: /api/auth/square/callback
          method: GET
          cors: true
      - http:
          path: /auth/success
          method: GET
          cors: true
```

### Step 3: Implement Square Service
```javascript
// src/services/square.js

const getSquareCredentials = async () => {
  // Get credentials from AWS Secrets Manager
  const secret = await getSecret(process.env.SQUARE_CREDENTIALS_SECRET);
  const data = JSON.parse(secret.SecretString);
  
  if (!data.applicationId || !data.applicationSecret) {
    throw new Error('Invalid Square credentials format');
  }
  
  return data;
};

const exchangeCodeForToken = async (code) => {
  const credentials = await getSquareCredentials();
  
  const response = await axios.post('https://connect.squareup.com/oauth2/token', {
    client_id: credentials.applicationId,
    client_secret: credentials.applicationSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.SQUARE_REDIRECT_URL
  });

  return {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    expires_at: response.data.expires_at,
    merchant_id: response.data.merchant_id
  };
};

const getMerchantInfo = async (accessToken) => {
  const response = await fetch('https://connect.squareup.com/v2/merchants/me', {
    headers: {
      'Square-Version': '2023-12-13',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  return data.merchant;
};
```

### Step 4: Implement User Model
```javascript
// src/models/user.js

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

const User = {
  async findBySquareMerchantId(merchantId) {
    const params = {
      TableName: process.env.USERS_TABLE,
      IndexName: 'SquareMerchantIndex',
      KeyConditionExpression: 'square_merchant_id = :merchantId',
      ExpressionAttributeValues: {
        ':merchantId': merchantId
      }
    };
    
    const result = await dynamodb.send(new QueryCommand(params));
    return result.Items?.[0] || null;
  },

  async create(userData) {
    const params = {
      TableName: process.env.USERS_TABLE,
      Item: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        square_merchant_id: userData.square_merchant_id,
        square_access_token: userData.square_access_token,
        square_refresh_token: userData.square_refresh_token,
        square_token_expires_at: userData.square_token_expires_at,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
    
    await dynamodb.send(new PutCommand(params));
    return params.Item;
  }
};
```

### Step 5: Implement OAuth Handlers
```javascript
// src/oauthHandlers.js

const express = require('express');
const serverless = require('serverless-http');
const { exchangeCodeForToken, getMerchantInfo } = require('./services/square');
const User = require('./models/user');
const jwt = require('jsonwebtoken');

const app = express();

app.get('/api/auth/square/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing required parameters'
      });
    }

    const tokenResponse = await exchangeCodeForToken(code);
    const merchantInfo = await getMerchantInfo(tokenResponse.access_token);

    let user = await User.findBySquareMerchantId(tokenResponse.merchant_id);
    if (!user) {
      user = await User.create({
        id: `user-${tokenResponse.merchant_id}`,
        name: merchantInfo.business_name || 'Square Merchant',
        email: `${tokenResponse.merchant_id}@example.com`,
        square_merchant_id: tokenResponse.merchant_id,
        square_access_token: tokenResponse.access_token,
        square_refresh_token: tokenResponse.refresh_token,
        square_token_expires_at: tokenResponse.expires_at
      });
    }

    const token = jwt.sign({
      sub: user.id,
      merchant_id: tokenResponse.merchant_id
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.redirect(`${process.env.API_BASE_URL}/auth/success?token=${token}`);
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).json({
      error: 'Failed to complete OAuth flow',
      type: 'internal_error'
    });
  }
});

app.get('/auth/success', (req, res) => {
  const { token } = req.query;
  // Return success page HTML
});

module.exports.squareCallback = serverless(app);
```

## 4. Common Pitfalls and Solutions

### Pitfall 1: Square API Parameter Format
**Problem**: Square API expects snake_case parameters
**Solution**: Always use snake_case for Square API requests:
```javascript
{
  client_id: credentials.applicationId,
  client_secret: credentials.applicationSecret,
  // NOT clientId, clientSecret
}
```

### Pitfall 2: Redirect URL Mismatch
**Problem**: Square rejects OAuth if URLs don't match exactly
**Solution**: 
- Use exact URL from API Gateway
- Include https:// prefix
- No trailing slash
- URL-encode all parameters

### Pitfall 3: JWT Secret Configuration
**Problem**: JWT_SECRET undefined in production
**Solution**:
```bash
# Create secure secret
aws ssm put-parameter \
  --name "/joylabs/dev/JWT_SECRET" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString
```

### Pitfall 4: DynamoDB Permissions
**Problem**: Lambda can't access DynamoDB
**Solution**: Add IAM roles in serverless.yml:
```yaml
iamRoleStatements:
  - Effect: Allow
    Action:
      - dynamodb:Query
      - dynamodb:PutItem
    Resource: 
      - !GetAtt UsersTable.Arn
      - !Join ['', [!GetAtt UsersTable.Arn, '/index/*']]
```

## 5. Testing Guide

### Local Testing
```bash
# Set environment variables
export JWT_SECRET="test-secret"
export SQUARE_REDIRECT_URL="http://localhost:3000/callback"

# Start local server
npm run dev

# Test OAuth flow
curl "http://localhost:3000/api/auth/square/callback?code=test_code&state=test_state"
```

### Production Testing
1. Deploy to dev environment:
   ```bash
   npm run deploy
   ```

2. Test OAuth flow:
   - Visit `/api/auth/square`
   - Complete Square authorization
   - Verify callback handling
   - Check success page
   - Validate JWT token

3. Monitor logs:
   ```bash
   serverless logs -f squareCallback
   ```

## 6. Security Considerations

### Credential Storage
- Never commit secrets
- Use AWS Secrets Manager
- Rotate secrets regularly
- Encrypt tokens in DynamoDB

### Token Handling
- Short JWT expiration
- Secure token storage
- Implement refresh flow
- Validate tokens properly

### Error Handling
- Sanitize error messages
- Log securely (no secrets)
- Rate limiting
- Input validation

## 7. Maintenance Guide

### Regular Tasks
1. Monitor error rates
2. Check token expiration
3. Verify OAuth flow
4. Update dependencies
5. Review security settings

### Troubleshooting
1. Check CloudWatch logs
2. Verify environment variables
3. Test Square API status
4. Validate credentials
5. Check DynamoDB indexes

### Updates and Changes
1. Monitor Square API versions
2. Update SDK versions
3. Review security patches
4. Test after updates