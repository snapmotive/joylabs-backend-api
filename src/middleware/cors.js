const cors = require('cors');

// Enhanced CORS middleware for both web and mobile apps
const configureCors = () => {
  const allowedOrigins = [
    // Mobile app schemes
    'joylabs://',
    'exp://',
    
    // Development origins
    'http://localhost:3000',
    'http://localhost:19006', // Expo web
    'http://localhost:19000', // Expo development
    'http://localhost:19001', // Expo development
    'http://127.0.0.1:3000',
    
    // Production origins (add your domains here)
    process.env.CORS_ORIGIN,
    'https://joylabs.app'
  ].filter(Boolean); // Remove any undefined origins
  
  return cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      
      // Check if the origin is allowed
      if (allowedOrigins.some(allowedOrigin => origin.startsWith(allowedOrigin))) {
        callback(null, true);
      } else {
        console.warn(`Origin ${origin} not allowed by CORS`);
        callback(null, true); // Allow anyway for now, but log it
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'X-Amz-Date', 
      'Authorization', 
      'X-Api-Key', 
      'X-Amz-Security-Token', 
      'X-Amz-User-Agent',
      'X-Requested-With',
      'Cookie'
    ],
    exposedHeaders: ['Set-Cookie'],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
};

module.exports = configureCors; 