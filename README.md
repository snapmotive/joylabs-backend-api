# JoyLabs Backend API

Serverless backend API for JoyLabs Catalogue App that integrates with Square.

## Features

- Serverless architecture using AWS Lambda and API Gateway
- DynamoDB for data storage
- Square OAuth integration for catalog management
- JWT authentication
- Testing page for AWS and Square integration

## Prerequisites

- Node.js (v16+)
- AWS CLI configured with appropriate permissions
- Serverless Framework
- Square Developer Account

## Security Best Practices for Square OAuth

This project follows security best practices for implementing Square OAuth:

### Backend Security Measures
- **Secrets Management**: All Square credentials are stored in AWS Secrets Manager
- **PKCE Support**: Implements PKCE for secure mobile authentication
- **Token Refresh**: Proactive token refresh before expiration
- **Token Revocation**: Secure OAuth token revocation endpoint
- **Security Monitoring**: CloudWatch metrics for authentication events

### API Gateway Security
- **WAF Protection**: Web Application Firewall blocks common attacks
- **Rate Limiting**: Prevents abuse with per-IP rate limits
- **Geo-Blocking**: Blocks high-risk country access
- **API Keys**: Protected endpoints with API key requirements

### Mobile App Integration
- See [Expo OAuth Example](docs/expo-oauth-example.md) for secure implementation

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/joylabs-backend.git
cd joylabs-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables securely:
```bash
npm run setup-env
```

This will:
- Create a `.env.template` file with placeholder values
- Generate a `.env.local` file with a secure random JWT secret
- Provide instructions for filling in your Square credentials

## Square App Setup

1. Go to the [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Create a new application
3. Set the following in your application settings:
   - Application type: `Web` and `Mobile`
   - OAuth Redirect URL: `http://localhost:5000/api/auth/square/callback` (for development)
   - Permissions: 
     - Items API (Read/Write)
     - Merchant Profile (Read)
     - Orders API (Read/Write)
     - Inventory API (Read/Write)

4. Update your `.env.local` file with your application credentials (NEVER commit this file)

## Running Locally

1. Install DynamoDB local (if not already installed):
```bash
serverless dynamodb install
```

2. Start the local development server:
```bash
npm run dev
```

This will start:
- API server on port 3001
- Local DynamoDB on port 8000

3. Visit the test page at http://localhost:3001/api/auth/square/test to verify your setup

## AWS Deployment

1. Set up your secrets in AWS Secrets Manager:
```bash
node scripts/setup-aws-secrets.js
```

2. Make sure you have AWS credentials configured:
```bash
aws configure
```

3. Deploy to AWS:
```bash
npm run deploy
```

For production deployment:
```bash
npm run deploy:prod
```

4. Update your Square application settings with the new API Gateway URL:
   - OAuth Redirect URL: `https://your-api-id.execute-api.region.amazonaws.com/dev/api/auth/square/callback`

## DynamoDB Structure

The backend uses three DynamoDB tables:

### Products Table
- Primary key: `id` (UUID)
- GSI: `sku`, `barcode`

### Categories Table
- Primary key: `id` (UUID)
- GSI: `name`

### Users Table
- Primary key: `id` (UUID)
- GSI: `email`, `square_merchant_id`

## API Routes

### Auth
- `GET /api/auth/square` - Start Square OAuth flow
- `GET /api/auth/square/callback` - Square OAuth callback
- `GET /api/auth/success` - Success page with token
- `POST /api/auth/logout/:userId` - Revoke Square access token

### Products
- `GET /api/products` - List products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Categories
- `GET /api/categories` - List categories
- `GET /api/categories/:id` - Get category by ID
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Health
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health status
- `GET /api/health/test-page` - Test page for Square OAuth and AWS

## Testing

Run the test suite:
```bash
npm test
```

## Troubleshooting

### Square OAuth
If you're having issues with the Square OAuth flow:
1. Verify your application settings in the Square Developer Dashboard
2. Check that your redirect URLs are correct
3. Make sure your API Base URL is set correctly in `.env`
4. Visit the test page at `/test` and check all settings

### AWS Deployment
If you encounter AWS deployment issues:
1. Check your AWS credentials
2. Verify IAM permissions
3. Look at CloudWatch logs for errors
4. Ensure your environment variables are set correctly

## License

MIT 