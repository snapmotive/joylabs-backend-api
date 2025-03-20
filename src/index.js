const express = require('express');
const serverless = require('serverless-http');
const morgan = require('morgan');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const session = require('express-session');

// Custom CORS middleware
const configureCors = require('./middleware/cors');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Apply CORS middleware with custom configuration
app.use(configureCors());

// Apply middlewares
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieParser(process.env.COOKIE_SECRET || 'joylabs-secret'));

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'joylabs-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none'
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
