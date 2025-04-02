# Node.js 22 Migration Implementation Checklist

This document outlines the specific steps to complete the migration from Node.js 18 to Node.js 22 for the JoyLabs backend.

## Implementation Status

| Task | Status | Description |
|------|--------|-------------|
| Runtime Configuration | ✅ Done | Updated serverless.yml and package.json to specify Node.js 22 |
| Dependency Compatibility | ✅ Done | All dependencies are compatible with Node.js 22 |
| Crypto Module Updates | ✅ Done | Replaced custom timingSafeEqual with native implementation |
| HTTP Header Case Standardization | ✅ Done | Standardized on lowercase header names with backward compatibility |
| V8 Engine Compatibility | ✅ Done | Codebase uses standard JavaScript patterns compatible with V8 |
| Error Handling Review | 🟡 Pending | Additional testing needed for API error handling |
| Integration Testing | 🟡 Pending | Need to verify Square API interactions and OAuth flows |
| Performance Monitoring | 🟡 Pending | Monitor cold start times and execution performance post-migration |

## Implementation Details

### 1. Runtime Configuration

- Updated `serverless.yml`: Set runtime to `nodejs22.x`
- Updated `package.json`: Added `"engines": { "node": ">=22.0.0" }`
- Updated Babel configuration in `webpack.config.js`: Set targets to `{ node: '22' }`

### 2. Dependency Compatibility

- Square SDK: Updated to version 42.0.0
- AWS SDK: Using v3 components (client-dynamodb, etc.)
- Axios: Using version 1.8.4, compatible with Node.js 22

### 3. Crypto Module Updates

- Replaced custom `timingSafeEqual` with native `crypto.timingSafeEqual`
- Added proper Buffer conversion and error handling
- Maintained correct usage of `crypto.randomBytes()` and `crypto.createHmac()`

### 4. HTTP Header Case Standardization

- In `src/middleware/auth.js`: Standardized on lowercase `authorization`
- In `src/catalogHandlers.js`: Updated header access with fallbacks for backward compatibility
- Added comments explaining Node.js 22 header name normalization

## Testing Plan

### Unit Tests

1. Run existing unit tests with Node.js 22
2. Add tests for header case handling
3. Add tests for crypto module functions

### Integration Tests

1. Test Square API authentication flow
2. Test webhook signature verification
3. Test token refresh functionality
4. Verify OAuth callback handling

### Production Deployment

1. Deploy to staging environment first
2. Monitor AWS Lambda cold start times
3. Check for any runtime errors or warnings
4. Verify all API endpoints function correctly
5. Deploy to production with careful monitoring

## Rollback Plan

If issues are encountered after deployment:

1. Revert serverless.yml runtime back to nodejs18.x
2. Deploy previous version
3. Document specific issues encountered for future resolution

## Additional Notes

- The codebase is well-positioned for Node.js 22 with minimal breaking changes
- AWS Lambda cold starts may be affected and should be monitored
- Continue to watch for any deprecated APIs in future Node.js releases 