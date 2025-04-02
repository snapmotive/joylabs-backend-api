const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

// Cache AWS clients for connection reuse
let dynamoDbClient = null;
const getDynamoDb = () => {
  if (!dynamoDbClient) {
    const client = new DynamoDBClient({
      maxAttempts: 3,
      requestTimeout: 3000,
      region: process.env.AWS_REGION,
    });
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDbClient;
};

// Get table name with environment-specific suffix
const getTableName = baseName => {
  return `${baseName}-v3-production`;
};

/**
 * Store a webhook event in DynamoDB
 */
exports.storeWebhookEvent = async event => {
  const dynamoDb = getDynamoDb();
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days TTL

  const item = {
    id: `webhook-${timestamp}-${Math.random().toString(36).substring(2, 15)}`,
    eventType: event.type,
    merchantId: event.merchant_id,
    eventId: event.event_id,
    data: JSON.stringify(event.data),
    createdAt: timestamp,
    status: 'pending',
    ttl: ttl,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: getTableName('joylabs-webhooks'),
      Item: item,
    })
  );

  console.log(`Stored webhook event: ${item.id}`);
  return item.id;
};

/**
 * Process a webhook event
 */
exports.processWebhookEvent = async event => {
  console.log(`Processing webhook event: ${event.event_id}, type: ${event.type}`);

  try {
    // Handle different event types
    switch (event.type) {
      case 'catalog.version.updated':
        await handleCatalogUpdate(event);
        break;

      case 'inventory.count.updated':
        await handleInventoryUpdate(event);
        break;

      // Add more event handlers here

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    // Mark event as processed
    await updateWebhookStatus(event.event_id, 'processed');
    console.log(`Successfully processed webhook event: ${event.event_id}`);
  } catch (error) {
    console.error(`Error processing webhook event ${event.event_id}:`, error);

    // Mark event as failed
    await updateWebhookStatus(event.event_id, 'failed', error.message);

    // Re-throw the error
    throw error;
  }
};

/**
 * Update the status of a webhook event
 */
async function updateWebhookStatus(eventId, status, errorMessage = null) {
  const dynamoDb = getDynamoDb();
  const timestamp = new Date().toISOString();

  try {
    // Query to find the webhook by eventId using the index
    const queryParams = {
      TableName: getTableName('joylabs-webhooks'),
      IndexName: 'eventId-index',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId,
      },
    };

    console.log(`Looking up webhook with eventId: ${eventId}`);
    const result = await dynamoDb.send(new QueryCommand(queryParams));

    if (result.Items && result.Items.length > 0) {
      const webhook = result.Items[0];
      await updateWebhookItem(webhook.id, status, timestamp, errorMessage);
      console.log(`Updated webhook ${webhook.id} status to ${status}`);
      return;
    }

    console.log(`No webhook found with eventId ${eventId} in index, falling back to scan`);

    // Fallback: If no result from index query, try scanning (less efficient but works if index not set up)
    const scanParams = {
      TableName: getTableName('joylabs-webhooks'),
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId,
      },
    };

    const scanResult = await dynamoDb.send(new ScanCommand(scanParams));

    if (scanResult.Items && scanResult.Items.length > 0) {
      const webhook = scanResult.Items[0];
      await updateWebhookItem(webhook.id, status, timestamp, errorMessage);
      console.log(`Updated webhook ${webhook.id} status to ${status} (found via scan)`);
    } else {
      console.warn(`No webhook found with eventId: ${eventId}`);
    }
  } catch (error) {
    console.error(`Error updating webhook status for eventId ${eventId}:`, error);
    // Don't throw the error to prevent stopping webhook processing
  }
}

/**
 * Helper function to update a webhook item by ID
 */
async function updateWebhookItem(id, status, timestamp, errorMessage = null) {
  const dynamoDb = getDynamoDb();

  // Update the webhook status
  const updateParams = {
    TableName: getTableName('joylabs-webhooks'),
    Key: { id },
    UpdateExpression: 'SET #status = :status, processedAt = :processedAt',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':processedAt': timestamp,
    },
  };

  // Add error message if present
  if (errorMessage) {
    updateParams.UpdateExpression += ', errorMessage = :errorMessage';
    updateParams.ExpressionAttributeValues[':errorMessage'] = errorMessage;
  }

  await dynamoDb.send(new UpdateCommand(updateParams));
}

/**
 * Handle catalog update events
 */
async function handleCatalogUpdate(event) {
  console.log('Handling catalog update event');
  // Implement catalog update logic here
}

/**
 * Handle inventory update events
 */
async function handleInventoryUpdate(event) {
  console.log('Handling inventory update event');
  // Implement inventory update logic here
}
