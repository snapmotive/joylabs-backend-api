const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const morgan = require('morgan');

// Import services
const squareService = require('./services/square');
const webhookService = require('./services/webhook');

// Create express app for webhook handler
const app = express();

// Apply middleware
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Square-Signature'],
  maxAge: 86400 // Cache CORS preflight requests for 24 hours
}));

// Production logging
app.use(morgan('combined'));
app.use(express.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    // Store raw body for signature verification
    req.rawBody = buf.toString();
    console.log('Request body captured for signature verification, length:', buf.length);
  }
}));

// Log all requests
app.use((req, res, next) => {
  console.log(`Webhook request received: ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Square webhook endpoint
app.post('/api/webhooks/square', async (req, res) => {
  try {
    console.log('Received Square webhook');
    
    // Get signature from headers
    const signature = req.headers['square-signature'];
    
    if (!signature) {
      console.warn('Missing Square signature header');
      return res.status(401).json({ 
        error: 'Missing signature header',
        detail: 'The Square-Signature header is required for webhook verification'
      });
    }
    
    console.log('Request body length:', req.rawBody ? req.rawBody.length : 'not captured');
    
    // Verify webhook signature with the updated function
    const isValidSignature = await squareService.verifyWebhookSignature(
      signature,
      req.rawBody
    );
    
    if (!isValidSignature) {
      console.warn('Invalid Square webhook signature');
      return res.status(401).json({ 
        error: 'Invalid signature',
        detail: 'The webhook signature failed verification. Please check the signature key.'
      });
    }
    
    // Process webhook event
    const event = req.body;
    
    if (!event || !event.type) {
      console.error('Invalid webhook payload structure:', JSON.stringify(req.body));
      return res.status(400).json({ 
        error: 'Invalid webhook payload',
        detail: 'Webhook payload must contain a "type" property'
      });
    }
    
    console.log(`Processing Square webhook event: ${event.type}, event ID: ${event.event_id || 'not provided'}`);
    
    // Store webhook event for processing
    const webhookId = await webhookService.storeWebhookEvent(event);
    
    // Acknowledge receipt of the webhook
    res.status(200).json({ 
      received: true,
      webhookId,
      eventType: event.type
    });
    
    // Process asynchronously
    // This allows us to return a quick response to Square
    // while processing the webhook in the background
    process.nextTick(async () => {
      try {
        await webhookService.processWebhookEvent(event);
      } catch (processError) {
        console.error('Error processing webhook asynchronously:', processError);
        console.error('Stack trace:', processError.stack);
      }
    });
    
  } catch (error) {
    console.error('Square webhook error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'An error occurred processing the webhook',
      detail: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/api/webhooks/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Webhook service is running',
    environment: 'production'
  });
});

// Export Serverless handler
exports.handler = serverless(app); 