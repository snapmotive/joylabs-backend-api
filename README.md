# JoyLabs Backend API

Serverless backend API for the JoyLabs Catalogue Management application built with AWS Lambda, API Gateway, and DynamoDB.

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **AWS Lambda** - Serverless compute
- **Amazon API Gateway** - API management
- **Amazon DynamoDB** - NoSQL database
- **Serverless Framework** - Infrastructure as code
- **Jest** - Testing framework

## Project Structure

```
joylabs-backend-api/
├── src/                    # Source code
│   ├── controllers/        # Request handlers
│   ├── models/             # DynamoDB service models
│   ├── routes/             # API routes
│   ├── utils/              # Utility functions
│   │   └── validation/     # Joi validation schemas
│   └── index.js            # App entry point
├── .env.example            # Example environment variables
├── .gitignore              # Git ignore file
├── package.json            # Project manifest
├── serverless.yml          # Serverless Framework configuration
└── README.md               # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (v14+ recommended)
- AWS CLI configured with your credentials
- Serverless Framework CLI

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/snapmotive/joylabs-backend-api.git
   cd joylabs-backend-api
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`
   ```
   NODE_ENV=development
   ```

4. Install DynamoDB local for development
   ```bash
   serverless dynamodb install
   ```

5. Start the local development environment
   ```bash
   npm run dev
   ```

## API Endpoints

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get a product by ID
- `POST /api/products` - Create a product
- `PUT /api/products/:id` - Update a product
- `DELETE /api/products/:id` - Delete a product

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get a category by ID
- `POST /api/categories` - Create a category
- `PUT /api/categories/:id` - Update a category
- `DELETE /api/categories/:id` - Delete a category

## Deployment

### Deploy to AWS
```bash
# Deploy to development
npm run deploy

# Deploy to production
npm run deploy:prod
```

### Remove from AWS
```bash
serverless remove
```

## Local Development

Start the local development environment with Serverless Offline:

```bash
npm run dev
```

This will start:
- A local API Gateway at http://localhost:5000
- A local DynamoDB instance at http://localhost:8000

## Testing

Run tests with Jest:

```bash
npm test
```

## License

This project is licensed under the MIT License. 