const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const AWS = require('aws-sdk');
const morgan = require('morgan');

// Custom CORS middleware
const configureCors = require('./middleware/cors');

// Cache AWS clients for connection reuse
let dynamoDbClient = null;
const getDynamoDb = () => {
  if (!dynamoDbClient) {
    const options = process.env.IS_OFFLINE === 'true' ? 
      { region: 'localhost', endpoint: 'http://localhost:8000' } : 
      { maxRetries: 3 };
    dynamoDbClient = new AWS.DynamoDB(options);
  }
  return dynamoDbClient;
};

// Initialize express app
const app = express();

// Configure session store based on environment
let sessionStore;
if (process.env.IS_OFFLINE === 'true') {
  console.log('Using memory session store for local development');
  // Use memory store for local development
  sessionStore = new session.MemoryStore();
} else {
  console.log('Using DynamoDB session store for production');
  // Configure DynamoDB session store for production with connection reuse
  const dynamoDb = getDynamoDb();
  sessionStore = new DynamoDBStore({
    table: 'joylabs-sessions-' + process.env.NODE_ENV,
    client: dynamoDb,
    hashKey: 'id',
    ttl: 24 * 60 * 60, // 1 day TTL
    touchAfter: 30 * 60 // Only update session if 30 minutes have passed since last update
  });
  // Handle store errors to prevent crashing
  sessionStore.on('error', function(error) {
    console.error('Session store error:', error);
  });
}

// Enhanced logging middleware for non-production environments
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // For production - only log errors and important events
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400
  }));
}

// Apply CORS middleware with custom configuration
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // Cache CORS preflight requests for 24 hours
}));

// Apply middlewares with performance optimizations
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

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

// Configure session with performance optimizations
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'joylabs-session-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiry on every request
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  // Don't save session if nothing was changed
  saveUninitialized: false
}));

// Import routes
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');

// Performance monitoring middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // Track response time after request completes
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    // Log slow requests (over 500ms)
    if (duration > 500) {
      console.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
      
      // In production, we could send this to CloudWatch Metrics
      if (process.env.NODE_ENV === 'production') {
        const cloudwatch = new AWS.CloudWatch();
        cloudwatch.putMetricData({
          Namespace: 'JoyLabs/API',
          MetricData: [{
            MetricName: 'SlowRequest',
            Dimensions: [
              { Name: 'Endpoint', Value: req.originalUrl },
              { Name: 'Environment', Value: process.env.NODE_ENV }
            ],
            Value: duration,
            Unit: 'Milliseconds'
          }]
        }).promise().catch(err => console.error('Error sending metric:', err));
      }
    }
  });
  
  next();
});

// Routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);

// Test page route
app.get('/test', (req, res) => {
  res.redirect('/api/health/test-page');
});

// OPTIONS preflight handling for all routes
app.options('*', configureCors());

// Default route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to JoyLabs API',
    links: {
      health: '/api/health',
      test: '/test',
      products: '/api/products',
      categories: '/api/categories',
      auth: '/api/auth'
    }
  });
});

// Global error handler with better error classification and logging
app.use((err, req, res, next) => {
  // Classify error type
  let statusCode = 500;
  let errorType = 'server_error';
  let logLevel = 'error';
  
  // Classify common errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorType = 'validation_error';
    logLevel = 'warn';
  } else if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
    statusCode = 401;
    errorType = 'unauthorized';
    logLevel = 'warn';
  } else if (err.name === 'ForbiddenError' || err.message.includes('forbidden')) {
    statusCode = 403;
    errorType = 'forbidden';
    logLevel = 'warn';
  } else if (err.name === 'NotFoundError' || err.message.includes('not found')) {
    statusCode = 404;
    errorType = 'not_found';
    logLevel = 'info';
  }
  
  // Log with appropriate level
  if (logLevel === 'error') {
    console.error(`[ERROR] ${err.stack}`);
  } else if (logLevel === 'warn') {
    console.warn(`[WARN] ${err.message}`);
  } else {
    console.log(`[INFO] ${err.message}`);
  }
  
  // Send response
  res.status(statusCode).json({
    error: errorType,
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    id: req.id // Include request ID if available for troubleshooting
  });
  
  // Track error metrics in production
  if (process.env.NODE_ENV === 'production') {
    try {
      const cloudwatch = new AWS.CloudWatch();
      cloudwatch.putMetricData({
        Namespace: 'JoyLabs/Errors',
        MetricData: [{
          MetricName: 'APIError',
          Dimensions: [
            { Name: 'ErrorType', Value: errorType },
            { Name: 'Environment', Value: process.env.NODE_ENV }
          ],
          Value: 1,
          Unit: 'Count'
        }]
      }).promise().catch(metricErr => console.error('Error sending metric:', metricErr));
    } catch (metricErr) {
      console.error('Failed to log error metric:', metricErr);
    }
  }
});

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.LAMBDA_TASK_ROOT && !process.env.AWS_EXECUTION_ENV && !process.env.SERVERLESS_OFFLINE) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`Test page available at: http://localhost:${PORT}/test`);
  });
}

// Configure serverless handler with optimizations
const serverlessOptions = {
  request: (request, event, context) => {
    // Add request ID for tracking
    request.id = context.awsRequestId;
    // Set context for later use
    request.context = context;
    // Track invocation cold start
    request.coldStart = context.coldStart === true;
  }
};

// Export for serverless with optimized configuration
module.exports.handler = serverless(app, serverlessOptions);
