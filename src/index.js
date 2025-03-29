const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')(session);
const morgan = require('morgan');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Constants
const STATES_TABLE = process.env.STATES_TABLE;

// Custom CORS middleware
const configureCors = require('./middleware/cors');

// Cache AWS clients for connection reuse
let dynamoDbClient = null;
const getDynamoDb = () => {
  if (!dynamoDbClient) {
    const client = new DynamoDBClient({
      maxAttempts: 3,
      requestTimeout: 3000,
      region: process.env.AWS_REGION
    });
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDbClient;
};

// Initialize express app
const app = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware
const sessionConfig = {
  store: process.env.NODE_ENV === 'production' ? new DynamoDBStore({
    table: 'joylabs-sessions',
    AWSConfigJSON: {
      region: 'us-west-1'
    },
    reapInterval: 24 * 60 * 60 * 1000 // Cleanup expired sessions every 24 hours
  }) : null,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

app.use(session(sessionConfig));

// Apply CORS after session middleware
app.use(configureCors());

// Enhanced logging middleware for non-production environments
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // For production - only log errors and important events
  app.use(morgan('combined'));
}

// Cache-Control header middleware
app.use((req, res, next) => {
  // Add cache headers to GET requests to static endpoints
  if (req.method === 'GET' && process.env.ENABLE_RESPONSE_CACHE === 'true') {
    if (req.path.startsWith('/api/health') || req.path === '/') {
      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    }
  }
  next();
});

// Import routes
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const catalogRoutes = require('./routes/catalog');

// Performance monitoring middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // Track response time after request completes
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    // Log slow requests (over 500ms)
    if (duration > 500) {
      console.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
  });
  
  next();
});

// Routes
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/catalog', catalogRoutes);

// Add request logging middleware
app.use((req, res, next) => {
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    query: req.query
  });
  next();
});

// State registration endpoint
app.post('/api/auth/register-state', async (req, res) => {
  console.log('POST to register-state endpoint received:', {
    headers: req.headers,
    body: req.body,
    tableName: STATES_TABLE,
    region: process.env.AWS_REGION
  });

  try {
    const { state } = req.body;

    if (!state) {
      console.error('Missing state parameter');
      return res.status(400).json({
        error: 'Missing state parameter'
      });
    }

    console.log('Preparing to store state in DynamoDB:', {
      state: state.substring(0, 5) + '...' + state.substring(state.length - 5),
      tableName: STATES_TABLE
    });

    // Store state in DynamoDB with 10-minute TTL
    const ttl = Math.floor(Date.now() / 1000) + (10 * 60); // Current time + 10 minutes in seconds
    const params = {
      TableName: STATES_TABLE,
      Item: {
        state: state,
        timestamp: Date.now(),
        used: false,
        ttl: ttl,
        redirectUrl: req.body.redirectUrl || '/auth/success'
      }
    };

    console.log('Sending PutCommand to DynamoDB with params:', {
      TableName: params.TableName,
      Item: {
        ...params.Item,
        state: params.Item.state.substring(0, 5) + '...' + params.Item.state.substring(params.Item.state.length - 5)
      }
    });

    const dynamoDb = getDynamoDb();
    const result = await dynamoDb.send(new PutCommand(params));
    
    console.log('DynamoDB PutCommand result:', {
      statusCode: result.$metadata.httpStatusCode,
      requestId: result.$metadata.requestId
    });

    console.log(`State parameter '${state.substring(0, 5)}...${state.substring(state.length - 5)}' registered successfully`);
    return res.status(200).json({
      success: true,
      message: 'State parameter registered successfully'
    });

  } catch (error) {
    console.error('Error registering state parameter:', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
      region: process.env.AWS_REGION,
      tableName: STATES_TABLE
    });
    return res.status(500).json({
      error: 'Failed to register state parameter',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Test page route
app.get('/test', (req, res) => {
  res.redirect('/api/health/test-page');
});

// OPTIONS preflight handling for all routes
app.options('*', configureCors());

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to the JoyLabs API', 
    links: {
      health: '/api/health',
      test: '/api/test',
      products: '/api/products',
      categories: '/api/categories',
      auth: '/api/auth',
      catalog: '/api/catalog'
    }
  });
});

// Global error handler with better error classification and logging
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Export the serverless handler
module.exports.handler = serverless(app);
