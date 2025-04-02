# Node.js 22 Migration Guide

This document outlines the changes made to upgrade the JoyLabs Backend API to Node.js 22, and provides guidance for developers working with the codebase.

## Changes Made

1. **Runtime Update**: 
   - Updated the AWS Lambda runtime from `nodejs18.x` to `nodejs22.x` in `serverless.yml`
   - Added Node.js version requirement (`>=22.0.0`) to the `engines` field in `package.json`
   - Updated Babel configuration in `webpack.config.js` to target Node.js 22

2. **OAuth Flow Standardization**:
   - Added documentation to clarify that `src/routes/auth.js` is the primary implementation
   - Added deprecation notice to `src/oauthHandlers.js` 
   - Enhanced JSDoc comments for the `refreshAccessToken` function

3. **Crypto Module Improvements**:
   - Replaced custom `timingSafeEqual` implementation with the native `crypto.timingSafeEqual` function
   - Updated Buffer handling to use proper error handling with the native crypto functions
   - Retained the use of `crypto.randomBytes()` which is still fully supported in Node.js 22

4. **Removed Firebase References**:
   - Confirmed no Firebase dependencies in main codebase
   - Firebase files are already isolated in the `unused-firebase-files` directory

## Benefits of Node.js 22

- **Performance Improvements**: Better startup times and reduced memory usage
- **Modern JavaScript Support**: Full support for ESM and the latest ECMAScript features
- **Security Enhancements**: Latest security fixes and improved crypto module
- **Improved Debugging**: Enhanced diagnostic reports and better error messages

## Developer Instructions

### Local Development Setup

1. Install Node.js 22 using NVM:
   ```
   nvm install 22
   nvm use 22
   ```

2. Update dependencies:
   ```
   npm ci
   ```

3. Test the application locally:
   ```
   npm run start
   ```

### Testing the OAuth Flow

The OAuth flow is implemented in two places for backward compatibility:
- `src/routes/auth.js` (primary implementation)
- `src/oauthHandlers.js` (deprecated)

When testing or making changes to the OAuth flow:
1. Always modify `src/routes/auth.js` first
2. Test changes thoroughly with the mobile application
3. Only update `src/oauthHandlers.js` if absolutely necessary

### Token Refresh Process

The token refresh process has been enhanced with:
- Comprehensive error handling
- Retry logic with exponential backoff
- Rate limiting
- Detailed error classification

To test the token refresh process:
1. Use the `/api/auth/square/refresh` endpoint with a refresh token
2. Verify error handling for invalid tokens
3. Check rate limiting behavior

## Known Issues and Considerations

1. **AWS Lambda Concurrency**: Node.js 22 uses more simultaneous connections during cold starts. Ensure Lambda concurrency limits are appropriate.

2. **Dependencies**: Some older dependencies may have issues with Node.js 22. If you encounter problems, check for updates or replacements.

3. **DynamoDB Timing**: Node.js 22's improved performance might lead to race conditions that weren't observed previously. Be cautious with high-throughput DynamoDB operations.

## Additional Resources

- [AWS Lambda Node.js 22 Runtime Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Node.js 22 Release Notes](https://nodejs.org/en/blog/release/v22.0.0/)
- [Auth0 Node.js 22 Migration Guide](https://auth0.com/docs/troubleshoot/product-lifecycle/deprecations-and-migrations/migrate-nodejs-22) 