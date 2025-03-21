const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const DynamoDBStore = require('connect-dynamodb')({ session });
const AWS = require('aws-sdk');

// Custom CORS middleware
const configureCors = require('./middleware/cors');

// Initialize express app
const app = express();

// Configure DynamoDB session store
const dynamoDb = process.env.IS_OFFLINE === 'true'
  ? new AWS.DynamoDB({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  : new AWS.DynamoDB();

const sessionStore = new DynamoDBStore({
  table: 'joylabs-sessions-' + process.env.NODE_ENV,
  client: dynamoDb,
  hashKey: 'id',
  ttl: 24 * 60 * 60 // 1 day TTL
});

// Apply CORS middleware with custom configuration
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

// Apply middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configure session
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'joylabs-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Import routes
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');

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

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.LAMBDA_TASK_ROOT && !process.env.AWS_EXECUTION_ENV && !process.env.SERVERLESS_OFFLINE) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`Test page available at: http://localhost:${PORT}/test`);
  });
}

// Export for serverless
module.exports.handler = serverless(app);
