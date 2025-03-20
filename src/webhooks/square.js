const crypto = require('crypto');
const AWS = require('aws-sdk');
const squareService = require('../services/square');

// Initialize DynamoDB client
const dynamoDb = process.env.IS_OFFLINE === 'true'
  ? new AWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  : new AWS.DynamoDB.DocumentClient();

/**
 * Verify Square webhook signature to ensure authenticity
 * @param {Object} request Express request object
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = async (request) => {
  try {
    const credentials = await squareService.getSquareCredentials();
    const signatureKey = credentials.SQUARE_WEBHOOK_SIGNATURE_KEY;
    
    if (!signatureKey) {
      console.error('Webhook signature key not configured');
      return false;
    }
    
    const signature = request.headers['x-square-signature'];
    if (!signature) {
      console.error('No signature found in request headers');
      return false;
    }
    
    // Create HMAC using the signature key
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(JSON.stringify(request.body));
    
    // Generate signature
    const expectedSignature = hmac.digest('base64');
    
    // Verify signature
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
};

/**
 * Process catalog.version.updated webhook event
 * @param {Object} eventData Webhook event data
 */
const handleCatalogUpdated = async (eventData) => {
  try {
    const { merchant_id, version } = eventData.data.object;
    console.log(`Catalog updated for merchant ${merchant_id}, version ${version}`);
    
    // Store the webhook event for audit purposes
    await dynamoDb.put({
      TableName: process.env.WEBHOOKS_TABLE,
      Item: {
        id: `${merchant_id}-${Date.now()}`,
        merchant_id,
        event_type: 'catalog.version.updated',
        version,
        timestamp: new Date().toISOString(),
        data: eventData
      }
    }).promise();
    
    // TODO: Add your catalog synchronization logic here
    
    return { 
      success: true, 
      message: 'Catalog update processed successfully' 
    };
  } catch (error) {
    console.error('Error processing catalog update:', error);
    return { 
      success: false, 
      message: 'Failed to process catalog update',
      error: error.message
    };
  }
};

/**
 * Process webhooks from Square
 * @param {Object} request Express request object
 * @param {Object} response Express response object
 */
const processWebhook = async (request, response) => {
  try {
    // Verify the webhook signature
    const isValid = await verifyWebhookSignature(request);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return response.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    const eventType = request.body.type;
    const eventId = request.body.event_id;
    console.log(`Received webhook: ${eventType}, ID: ${eventId}`);
    
    let result;
    
    // Handle different event types
    switch (eventType) {
      case 'catalog.version.updated':
        result = await handleCatalogUpdated(request.body);
        break;
        
      case 'merchant.custom_attribute_definition.owned.updated':
        // TODO: Implement merchant attribute handling
        result = { success: true, message: 'Custom attribute update acknowledged' };
        break;
        
      case 'online_checkout.merchant_settings.updated':
        // TODO: Implement checkout settings handling
        result = { success: true, message: 'Checkout settings update acknowledged' };
        break;
        
      default:
        console.warn(`Unhandled webhook event type: ${eventType}`);
        result = { success: true, message: 'Event acknowledged but not processed' };
    }
    
    // Log webhook receipt for audit purposes
    await dynamoDb.put({
      TableName: process.env.WEBHOOKS_TABLE,
      Item: {
        id: eventId,
        event_type: eventType,
        timestamp: new Date().toISOString(),
        processed: result.success,
        message: result.message
      }
    }).promise();
    
    // Always return 200 to acknowledge receipt (even if processing failed)
    // Square will retry based on its own retry policy
    response.status(200).json({ 
      status: 'acknowledged',
      message: result.message
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Return 200 to avoid retries, but log the error
    response.status(200).json({ 
      status: 'error', 
      message: 'Error processing webhook, but acknowledged receipt'
    });
  }
};

module.exports = {
  processWebhook
}; 