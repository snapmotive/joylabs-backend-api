const cors = require('cors');

// Define allowed origins
const allowedOrigins = [
  // Expo AuthSession origins
  'https://auth.expo.io',
  'https://auth.expo.io/@joylabs',
  'exp://exp.host/@joylabs',
  // Mobile app schemes
  'joylabs://',
  'exp://',
  // Development origins
  ...(process.env.NODE_ENV !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:19006',
        'http://localhost:19000',
        'http://localhost:19001',
        'http://127.0.0.1:3000',
        'exp://localhost:19000',
        'exp://127.0.0.1:19000',
      ]
    : []),
].filter(Boolean);

// Enhanced CORS middleware for both web and Expo AuthSession
const configureCors = () => {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Log the origin for debugging
      console.log('Incoming request origin:', origin);

      // Check if the origin starts with any allowed origin
      const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));

      if (isAllowed) {
        console.log(`Origin ${origin} is allowed`);
        callback(null, true);
      } else {
        console.warn(`Origin ${origin} not in allowed list`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'User-Agent',
      'Cookie',
      'Square-Signature',
    ],
    exposedHeaders: ['Set-Cookie'],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
};

// Special CORS for auth routes (Expo AuthSession)
const authCors = () => {
  return (req, res, next) => {
    try {
      // Log details for debugging
      console.log('Auth CORS middleware:', {
        path: req.path,
        method: req.method,
        origin: req.headers.origin || 'No origin',
        host: req.headers.host,
      });

      const origin = req.headers.origin;

      // For Expo AuthSession requests, allow the origin
      if (
        origin &&
        (origin.startsWith('https://auth.expo.io') ||
          origin.startsWith('exp://') ||
          origin.startsWith('joylabs://'))
      ) {
        console.log(`Expo AuthSession origin detected: ${origin}`);
        res.header('Access-Control-Allow-Origin', origin);
      } else {
        // For other origins, check against allowedOrigins
        const isAllowed = allowedOrigins.some(allowed => origin && origin.startsWith(allowed));

        if (isAllowed) {
          res.header('Access-Control-Allow-Origin', origin);
        } else {
          // Default to API_BASE_URL if origin not allowed
          res.header('Access-Control-Allow-Origin', process.env.API_BASE_URL);
        }
      }

      // Set other CORS headers
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, User-Agent, Origin, Cookie, Square-Signature'
      );
      res.header('Access-Control-Expose-Headers', 'Set-Cookie');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request for auth route:', req.path);
        res.header('Access-Control-Max-Age', '86400');
        return res.status(204).end();
      }

      next();
    } catch (error) {
      console.error('Auth CORS error:', error);
      next(error);
    }
  };
};

module.exports = configureCors;
module.exports.authCors = authCors;
