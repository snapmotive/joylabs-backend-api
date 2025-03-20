const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'X-Amz-Date', 
    'Authorization', 
    'X-Api-Key', 
    'X-Amz-Security-Token', 
    'X-Amz-User-Agent',
    'X-Requested-With'
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser());

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
app.options('*', cors(corsOptions));

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
    error: true, 
    message: err.message || 'An error occurred on the server' 
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
