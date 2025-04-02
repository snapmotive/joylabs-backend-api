# JoyLabs Backend API v3 Documentation

## API Endpoints

### Authentication

#### OAuth Flow

```http
GET /api/auth/connect/url
```

- **Description**: Get Square OAuth connect URL
- **Performance**: ~100ms response time
- **Node.js 22 Feature**: Uses native fetch API

```http
POST /api/auth/register-state
```

- **Description**: Register OAuth state for PKCE
- **Performance**: ~50ms response time
- **Node.js 22 Feature**: Uses WebCrypto API for state generation

```http
GET /api/auth/square/callback
```

- **Description**: OAuth callback handler
- **Performance**: ~200ms response time
- **Node.js 22 Feature**: Uses async context tracking

### Catalog

#### List Products

```http
GET /v2/catalog/list
```

- **Description**: Get paginated product list
- **Performance**: ~150ms response time
- **Node.js 22 Feature**: Uses streaming for large responses

#### Get Product

```http
GET /v2/catalog/item/{id}
```

- **Description**: Get single product details
- **Performance**: ~100ms response time
- **Node.js 22 Feature**: Uses error cause for better error handling

#### Search Products

```http
POST /v2/catalog/search
```

- **Description**: Search products with filters
- **Performance**: ~200ms response time
- **Node.js 22 Feature**: Uses structured clone for deep object copying

### Webhooks

```http
POST /api/webhooks/square
```

- **Description**: Handle Square webhook events
- **Performance**: ~100ms response time
- **Node.js 22 Feature**: Uses Web Streams for request body parsing

## Performance Expectations

1. **Response Times**

   - API endpoints: < 200ms (p95)
   - OAuth flows: < 500ms (p95)
   - Webhook processing: < 300ms (p95)

2. **Throughput**

   - API: 1000 requests/minute
   - Webhooks: 100 events/minute
   - OAuth: 50 authentications/minute

3. **Cold Start Times**
   - First request: < 800ms
   - Subsequent requests: < 100ms

## Error Handling

All endpoints follow this error response format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Node.js 22 Features

1. **Built-in Fetch API**

   - Used for Square API calls
   - Native promise support
   - Better memory management

2. **WebStreams**

   - Used for large response handling
   - Efficient memory usage
   - Better backpressure handling

3. **Error Cause**

   - Enhanced error tracking
   - Better error context
   - Improved debugging

4. **Performance Hooks**
   - Request timing metrics
   - Memory usage tracking
   - Cold start monitoring

## Security

1. **Authentication**

   - OAuth 2.0 with PKCE
   - Session-based authentication
   - JWT token validation

2. **Rate Limiting**

   - API: 1000 requests per IP per hour
   - OAuth: 10 attempts per IP per minute
   - Webhooks: Unlimited (Square-authenticated)

3. **Data Protection**
   - All data encrypted at rest
   - HTTPS-only communication
   - Secure session management

## Changelog

### Version 3.2.0

- Upgraded to Node.js 22.x
- Improved performance with native fetch
- Enhanced error handling
- Added streaming support for large responses

### Version 3.1.0

- Added new catalog endpoints
- Improved webhook processing
- Enhanced session management

### Version 3.0.0

- Initial release of v3 API
- Square SDK v42 integration
- AWS SDK v3 implementation
