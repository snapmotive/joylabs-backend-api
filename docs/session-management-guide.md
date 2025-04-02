# Session Management Guide

This document provides a comprehensive guide to session management in the JoyLabs Backend API, focusing on the Express session configuration with DynamoDB.

## Overview

The JoyLabs Backend API uses [express-session](https://github.com/expressjs/session) with a DynamoDB session store to manage user sessions across the serverless architecture. This approach provides:

- Persistent sessions across Lambda function invocations
- Secure session management with encryption
- Scalable session storage using DynamoDB
- Automatic session cleanup with TTL

## Configuration

### 1. Required Environment Variables

```
SESSION_SECRET=your_secure_random_string
```

The `SESSION_SECRET` is a required environment variable that must be set for production deployments. This secret is used to sign the session ID cookie and encrypt the session data.

### 2. DynamoDB Session Table

The DynamoDB session table is configured in `serverless.yml`:

```yaml
resources:
  Resources:
    SessionsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:custom.sessionsTable}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        TimeToLiveSpecification:
          AttributeName: expires
          Enabled: true
```

Key features:

- Uses pay-per-request billing for cost optimization
- Implements TTL for automatic session cleanup
- Uses the session ID as the primary key

### 3. Express Session Middleware

The session middleware is configured in `src/index.js`:

```javascript
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')(session);

// Configure session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'joylabs-session-secret-key-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    store: new DynamoDBStore({
      table: process.env.SESSIONS_TABLE || 'joylabs-sessions-production',
      AWSConfigJSON: {
        region: process.env.AWS_REGION || 'us-west-1',
      },
      readCapacity: 5,
      writeCapacity: 5,
    }),
  })
);
```

Key configuration options:

- **secret**: Uses the SESSION_SECRET environment variable with a fallback
- **resave**: Set to false to avoid unnecessary writes
- **saveUninitialized**: Set to false to comply with GDPR
- **cookie.secure**: Enables secure cookies in production
- **cookie.httpOnly**: Prevents JavaScript access to the cookie
- **store**: Uses DynamoDB for session storage

## Session Management Best Practices

### 1. Session Secret Management

The session secret should be:

- At least 32 characters long
- Randomly generated
- Stored securely in environment variables or AWS Secrets Manager
- Different across environments (dev, staging, production)

Example of generating a secure session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Session Data Management

When storing data in sessions:

- Store only essential information
- Avoid storing sensitive data like passwords
- Be mindful of session size (affects Lambda payload size)
- Use clear namespacing for session properties

Example:

```javascript
// Good practice
req.session.user = { id: userId, roles: userRoles };

// Avoid
req.session.user = entireUserObject; // Could be large and contain sensitive data
```

### 3. Session Expiration

The default session expiration is 24 hours, which can be adjusted based on security requirements:

```javascript
cookie: {
  maxAge: 8 * 60 * 60 * 1000; // 8 hours
}
```

For OAuth sessions, shorter timeframes may be appropriate:

```javascript
// For OAuth state parameter sessions
app.use(
  '/api/auth/square',
  session({
    // ... other options
    cookie: {
      maxAge: 10 * 60 * 1000, // 10 minutes
    },
  })
);
```

## Troubleshooting

### Common Issues

1. **"req.secret option required for sessions"**

   - Ensure the SESSION_SECRET environment variable is set
   - Check for typos in environment variable names

2. **Session data not persisting across requests**

   - Verify DynamoDB table exists and is accessible
   - Check IAM permissions for the Lambda function
   - Ensure cookie settings are appropriate for your domain

3. **"Error: connect ETIMEDOUT" with DynamoDB**
   - Check VPC configuration if Lambda is in a VPC
   - Ensure proper NAT gateway configuration
   - Verify the Lambda execution role has permission to access DynamoDB

## Security Considerations

1. **Cross-Site Request Forgery (CSRF) Protection**

   - Consider implementing CSRF tokens for sensitive operations
   - The API serves mobile applications, which reduces CSRF risk

2. **Cookie Security**

   - Use secure, HTTP-only cookies in production
   - Consider implementing SameSite cookie attributes

3. **Session Fixation Protection**
   - The session ID is regenerated on authentication
   - Implement user-agent validation for sensitive operations

## Performance Optimization

1. **Reduce Session Size**

   - Store minimal data in sessions
   - Consider using user references instead of complete objects

2. **Session Caching**
   - The DynamoDB store does not implement caching
   - Consider implementing a caching layer for high-traffic applications

## Conclusion

The Express session with DynamoDB configuration provides a robust, scalable solution for session management in the JoyLabs Backend API. By following the best practices outlined in this guide, you can ensure secure and efficient session management for your application.
