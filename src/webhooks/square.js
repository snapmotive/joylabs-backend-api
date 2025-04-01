const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const squareService = require('../services/square');

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Verify Square webhook signature to ensure authenticity
 * @param {Object} request Express request object
 * @returns {Promise<boolean>} True if signature is valid
 */
const verifyWebhookSignature = async (request) => {
  try {
    console.log('Verifying webhook signature using centralized square service');
    
    const signature = request.headers['square-signature'];
    if (!signature) {
      console.error('No signature found in request headers');
      return false;
    }
    
    if (!request.rawBody) {
      console.error('No raw body available in request');
      return false;
    }
    
    // Use the centralized function from square service
    return await squareService.verifyWebhookSignature(signature, request.rawBody);
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
    await dynamoDb.send(new PutCommand({
      TableName: process.env.WEBHOOKS_TABLE,
      Item: {
        id: `${merchant_id}-${Date.now()}`,
        merchant_id,
        event_type: 'catalog.version.updated',
        version,
        timestamp: new Date().toISOString(),
        data: eventData
      }
    }));
    
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
    await dynamoDb.send(new PutCommand({
      TableName: process.env.WEBHOOKS_TABLE,
      Item: {
        id: eventId,
        event_type: eventType,
        timestamp: new Date().toISOString(),
        processed: result.success,
        message: result.message
      }
    }));
    
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