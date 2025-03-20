const serverless = require('serverless-http');
const express = require('express');
const squareWebhooks = require('./webhooks/square');

// Create Express app for webhook handlers
const app = express();

// Middleware for parsing JSON
app.use(express.json());

// Square webhook endpoint
app.post('/api/webhooks/square', async (req, res) => {
  await squareWebhooks.processWebhook(req, res);
});

// Lambda handler
exports.squareWebhook = serverless(app); 