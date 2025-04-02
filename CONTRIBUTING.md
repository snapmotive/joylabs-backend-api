# Contributing to JoyLabs Backend API v3

## Development Environment Setup

1. **Node.js 22.x Setup**

   - Install Node.js 22.x using nvm (recommended)
   - Ensure you're using the correct version:
     ```bash
     nvm install 22
     nvm use 22
     node --version # Should show v22.x.x
     ```

2. **IDE Configuration**
   - Use VSCode with the following extensions:
     - ESLint
     - Prettier
     - TypeScript
   - Enable strict TypeScript checking
   - Configure auto-formatting on save

## Code Style Guidelines

### TypeScript Usage

- Use TypeScript for all new code
- Enable strict mode in tsconfig.json
- Define interfaces for all data structures
- Avoid using `any` type
- Use type assertions sparingly

### Node.js 22.x Features

- Utilize new Node.js 22 features:
  - Built-in fetch API
  - WebStreams
  - Test Runner
  - Performance Hooks
- Use ES modules over CommonJS
- Implement proper error handling with Error Cause

### AWS SDK v3 Guidelines

- Use AWS SDK v3 modular packages
- Implement proper error handling
- Use AWS SDK v3's middleware stack when needed
- Utilize automatic pagination helpers

### Express.js Best Practices

- Use async/await with proper error handling
- Implement request validation
- Use middleware for common operations
- Implement proper session management

## Testing

1. **Unit Tests**

   ```bash
   npm run test:unit
   ```

2. **Integration Tests**

   ```bash
   npm run test:integration
   ```

3. **E2E Tests**
   ```bash
   npm run test:e2e
   ```

## Performance Considerations

1. **Lambda Cold Starts**

   - Keep function sizes small
   - Use layers effectively
   - Implement proper connection pooling

2. **DynamoDB**

   - Use proper partition keys
   - Implement TTL for temporary data
   - Use batch operations when possible

3. **Square API**
   - Implement proper rate limiting
   - Use webhook notifications when possible
   - Cache responses when appropriate

## Security Guidelines

1. **OAuth Flow**

   - Use PKCE for OAuth
   - Implement proper state validation
   - Use secure session management

2. **API Security**

   - Implement proper CORS
   - Use HTTPS only
   - Validate all inputs
   - Implement rate limiting

3. **Secrets Management**
   - Use AWS Secrets Manager
   - Never commit sensitive data
   - Rotate credentials regularly

## Deployment

1. **Pre-deployment Checklist**

   - Run all tests
   - Check bundle sizes
   - Verify environment variables
   - Check layer sizes

2. **Deployment Commands**

   ```bash
   # Deploy everything
   npm run deploy

   # Deploy specific function
   npm run deploy:function:api

   # Deploy layers only
   npm run deploy:layers
   ```

3. **Post-deployment Verification**
   - Check CloudWatch logs
   - Verify API endpoints
   - Monitor metrics
   - Test critical flows
