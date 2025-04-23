/**
 * Webhook Handlers
 * Handles incoming webhooks, primarily from Square
 */
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const configureCors = require('./middleware/cors');
const squareService = require('./services/square');
// Use createErrorWithCause for better error context
const { safeSerialize, createErrorWithCause } = require('./utils/errorHandling');
const { Expo } = require('expo-server-sdk'); // For Push Notifications
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
// Import PutCommand, GetCommand, UpdateCommand for DynamoDB operations
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

// Initialize Express app
const app = express();

// AWS DynamoDB Client
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-1' });
const docClient = DynamoDBDocumentClient.from(dbClient);
const merchantsTableName =
  process.env.MERCHANTS_TABLE || 'joylabs-backend-api-merchants-v3-production';
// Define Webhooks table name from environment or default
const webhooksTableName =
  process.env.WEBHOOKS_TABLE || 'joylabs-backend-api-webhooks-v3-production';

// Initialize Expo SDK
const expo = new Expo();

// Middleware
app.use(configureCors());
app.use(cookieParser());

// IMPORTANT: Use express.raw() for the Square webhook route BEFORE express.json()
// Square signature verification requires the raw, unparsed request body.
app.post('/api/webhooks/square', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[WEBHOOK] Received Square webhook');
  const startTime = Date.now();

  // 1. Verify Signature
  const signature = req.headers['x-square-signature'];
  const rawBody = req.body; // This is the raw Buffer thanks to express.raw()

  if (!signature || !rawBody) {
    console.error('[WEBHOOK] Missing signature or body');
    return res.status(400).send('Bad Request: Missing signature or body');
  }

  let isValidSignature;
  try {
    // Convert rawBody buffer to string for verification function
    const bodyString = rawBody.toString('utf8');
    isValidSignature = await squareService.verifyWebhookSignature(signature, bodyString);
  } catch (error) {
    console.error('[WEBHOOK] Error during signature verification:', error);
    // Avoid sending detailed internal errors back
    return res.status(500).send('Internal Server Error: Signature verification failed');
  }

  if (!isValidSignature) {
    console.warn('[WEBHOOK] Invalid signature received');
    // Respond quickly but indicate the issue
    return res.status(400).send('Bad Request: Invalid signature');
  }

  console.log('[WEBHOOK] Signature verified successfully');

  // 2. Parse Event Data (only after signature verification)
  let eventData;
  try {
    // Now parse the validated raw body
    eventData = JSON.parse(rawBody.toString('utf8'));
  } catch (parseError) {
    console.error('[WEBHOOK] Error parsing JSON body:', parseError);
    return res.status(400).send('Bad Request: Invalid JSON format');
  }

  // Extract key fields safely
  const eventId = eventData.event_id;
  const eventType = eventData.type;
  const merchantId = eventData.merchant_id;
  const createdAt = eventData.created_at;

  // Validate essential fields
  if (!eventId || !eventType || !merchantId || !createdAt) {
    console.error(
      '[WEBHOOK] Invalid event payload: Missing required fields (event_id, type, merchant_id, created_at)'
    );
    // Log the received data (partially, be careful with sensitive info if any)
    console.error('[WEBHOOK] Received payload keys:', Object.keys(eventData));
    return res.status(400).send('Bad Request: Invalid event payload structure');
  }

  console.log(
    `[WEBHOOK] Processing Event ID: ${eventId}, Type: ${eventType}, Merchant: ${merchantId}`
  );

  // 3. Idempotency Check using DynamoDB
  try {
    const getItemParams = {
      TableName: webhooksTableName,
      Key: { eventId: eventId }, // Assuming eventId is the primary key
    };
    const { Item } = await docClient.send(new GetCommand(getItemParams));

    if (Item) {
      console.log(
        `[WEBHOOK] Event ID ${eventId} already processed at ${Item.receivedAt}. Skipping.`
      );
      // Acknowledge receipt even if skipped, indicating it's a duplicate
      return res.status(200).json({ received: true, status: 'skipped_duplicate' });
    }
  } catch (dbError) {
    console.error(`[WEBHOOK] DynamoDB error checking idempotency for event ${eventId}:`, dbError);
    // Decide if we should fail here or attempt processing anyway
    // Failing is safer to prevent potential duplicate processing if DB check fails temporarily
    return res.status(500).send('Internal Server Error: Idempotency check failed');
  }

  // 4. Store Webhook Event (Do this before initiating potentially long-running tasks like push)
  const receivedTimestamp = new Date(); // Get Date object for TTL calculation
  const ttlTimestamp = Math.floor(receivedTimestamp.getTime() / 1000) + 30 * 24 * 60 * 60; // 30 days in seconds

  try {
    const putItemParams = {
      TableName: webhooksTableName,
      Item: {
        eventId: eventId, // Primary Key
        eventType: eventType,
        merchantId: merchantId, // Potentially a GSI key if needed for lookups
        squareCreatedAt: createdAt,
        receivedAt: receivedTimestamp.toISOString(), // Store as ISO string
        payload: eventData, // Store the full payload for auditing/debugging
        processingStatus: 'received', // Initial status
        // Initialize other status fields
        processingStartedAt: null,
        processingEndedAt: null,
        processingError: null,
        pushTickets: null,
        ttl: ttlTimestamp, // Add TTL attribute (Number, epoch seconds)
      },
      // Optional: Add a condition expression to prevent overwrites if somehow a race condition occurred
      // ConditionExpression: "attribute_not_exists(eventId)"
    };
    await docClient.send(new PutCommand(putItemParams));
    console.log(`[WEBHOOK] Event ID ${eventId} stored in DynamoDB.`);
  } catch (dbError) {
    console.error(`[WEBHOOK] DynamoDB error storing event ${eventId}:`, dbError);
    // If storing fails, we might still proceed but log the error critically.
    // Decide if this is a critical failure. For now, we log and continue.
    // Acknowledge receipt to Square, but log the failure to store.
    console.error(
      `[WEBHOOK] CRITICAL: Failed to store event ${eventId} details. Proceeding with processing, but audit record missing.`
    );
    // Respond early if storing is absolutely critical before processing?
    // For now, let's proceed to notification but acknowledge the storage failure risk.
    // return res.status(500).send('Internal Server Error: Failed to store event');
  }

  // 5. Process Specific Events (e.g., catalog update push notification)
  // Use a switch for potentially handling more event types later
  switch (eventType) {
    case 'catalog.version.updated': {
      const catalogUpdatedAt = eventData.data?.object?.catalog_version?.updated_at;
      console.log(
        `[WEBHOOK] Catalog updated for merchant ${merchantId} at ${catalogUpdatedAt || 'N/A'}`
      );

      // Update status in DynamoDB before starting async push
      await updateWebhookStatus(eventId, 'processing_push'); // Use helper

      // Trigger Push Notification (Async - Do not await fully here)
      // Use .catch() to handle errors from the async background task without blocking the response
      sendCatalogUpdatePushNotification(merchantId, catalogUpdatedAt, eventId).catch(pushError => {
        console.error(
          `[WEBHOOK] Background push notification process failed for event ${eventId}:`,
          pushError
        );
        // The error and status update are handled within sendCatalogUpdatePushNotification now
      });

      // Immediate response to Square AFTER initiating background tasks
      console.log(
        `[WEBHOOK] Responding 200 OK for event ${eventId}. Background processing initiated. Total time: ${Date.now() - startTime}ms`
      );
      return res.status(200).json({ received: true, status: 'processing_started' });
    }

    // Add cases for other event types here if needed in the future
    // case 'inventory.count.updated':
    //   console.log(`[WEBHOOK] Inventory count updated for merchant ${merchantId}`);
    //   await updateWebhookStatus(eventId, 'processing_inventory');
    //   // Trigger inventory-specific logic (async)
    //   // processInventoryUpdate(eventData).catch(...)
    //   return res.status(200).json({ received: true, status: 'processing_inventory_started' });

    default: {
      console.log(`[WEBHOOK] Skipping processing for unhandled event type: ${eventType}`);
      // Update status for skipped events
      await updateWebhookStatus(eventId, 'skipped_unhandled_type');
      // Acknowledge skipped events
      console.log(
        `[WEBHOOK] Responding 200 OK for skipped event ${eventId}. Total time: ${Date.now() - startTime}ms`
      );
      return res.status(200).json({ received: true, status: 'skipped_unhandled_type' });
    }
  }
});

/**
 * Fetches push tokens and sends silent push notifications for catalog updates.
 * Runs asynchronously and updates DynamoDB status.
 * @param {string} merchantId
 * @param {string|null} catalogUpdatedAt - Timestamp from the webhook payload
 * @param {string} eventId - For logging and status updates
 */
async function sendCatalogUpdatePushNotification(merchantId, catalogUpdatedAt, eventId) {
  const pushStartTime = Date.now();
  console.log(`[PUSH ${eventId}] Starting push notification process for merchant ${merchantId}`);
  let pushTokens = [];
  let dbLookupTime = 0;
  let pushSendTime = 0;
  let finalStatus = 'error_unknown'; // Default status in case of early exit
  let processingError = null; // Store error details

  try {
    const dbStart = Date.now();
    const params = {
      TableName: merchantsTableName,
      Key: { merchantId: merchantId },
      ProjectionExpression: 'expoPushToken', // Only fetch the needed attribute
    };
    const { Item } = await docClient.send(new GetCommand(params));
    dbLookupTime = Date.now() - dbStart;

    if (Item && Item.expoPushToken) {
      const tokens = Array.isArray(Item.expoPushToken) ? Item.expoPushToken : [Item.expoPushToken];
      // Validate tokens before adding to the list
      pushTokens = tokens.filter(token => {
        if (Expo.isExpoPushToken(token)) {
          return true;
        } else {
          console.warn(
            `[PUSH ${eventId}] Invalid Expo push token format found for merchant ${merchantId}: ${token}`
          );
          return false;
        }
      });
      console.log(
        `[PUSH ${eventId}] Found ${pushTokens.length} valid push token(s) for merchant ${merchantId}. DB lookup: ${dbLookupTime}ms`
      );
    } else {
      console.log(
        `[PUSH ${eventId}] No Expo push token(s) found for merchant ${merchantId}. DB lookup: ${dbLookupTime}ms`
      );
    }

    if (pushTokens.length > 0) {
      const messages = pushTokens.map(pushToken => ({
        to: pushToken,
        sound: null,
        body: '', // Keep body empty for background notifications
        // Ensure data payload is lean and useful for the client
        data: {
          type: 'catalog_updated',
          eventId: eventId,
          merchantId: merchantId,
          updatedAt: catalogUpdatedAt || new Date().toISOString(),
        },
        priority: 'high', // Can be 'default' or 'high'
        channelId: 'catalog-updates', // Optional: For Android notification channels
      }));

      const chunks = expo.chunkPushNotifications(messages);
      const tickets = [];
      console.log(
        `[PUSH ${eventId}] Sending ${messages.length} push notification(s) in ${chunks.length} chunk(s).`
      );

      const pushStart = Date.now();
      let successfulSends = 0;
      let failedSends = 0;

      // Process chunks sequentially to avoid overwhelming Expo API
      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          // Log ticket status briefly
          ticketChunk.forEach(ticket => {
            if (ticket.status === 'ok') {
              successfulSends++;
            } else {
              failedSends++;
              // Log specific errors from tickets
              console.error(
                `[PUSH ${eventId}] Push ticket error: Status=${ticket.status}, Message='${ticket.message}', Details=${JSON.stringify(ticket.details || {})}`
              );
            }
          });
        } catch (pushChunkError) {
          // This catches errors in sending the chunk itself (network, API error)
          failedSends += chunk.length; // Assume all in chunk failed if sendPushNotificationsAsync throws
          console.error(`[PUSH ${eventId}] Error sending push notification chunk:`, pushChunkError);
          processingError = pushChunkError; // Record the error
          // Potentially break or continue depending on error type
        }
      }
      pushSendTime = Date.now() - pushStart;
      console.log(
        `[PUSH ${eventId}] Finished sending ${chunks.length} chunk(s). Success: ${successfulSends}, Failures: ${failedSends}. Total push send time: ${pushSendTime}ms`
      );

      // Set final status based on results
      finalStatus = failedSends > 0 ? 'completed_push_errors' : 'completed_push_sent';
      await updateWebhookStatus(
        eventId,
        finalStatus,
        processingError,
        tickets.map(t => ({ id: t.id, status: t.status }))
      ); // Store ticket status
    } else {
      // No tokens found
      finalStatus = 'completed_no_tokens';
      await updateWebhookStatus(eventId, finalStatus);
    }
  } catch (error) {
    // Catch errors from DB lookup or other unexpected issues
    console.error(`[PUSH ${eventId}] Unexpected error during push notification process:`, error);
    finalStatus = 'error_processing_push';
    processingError = error;
    // Update status with the error
    await updateWebhookStatus(eventId, finalStatus, processingError);
    // Rethrowing is optional, but helps indicate the background task failed if caller needs to know
    // throw error;
  } finally {
    console.log(
      `[PUSH ${eventId}] Push notification process ended with status: ${finalStatus}. Total time: ${Date.now() - pushStartTime}ms`
    );
  }
}

// Standard JSON parser for other routes if needed (MUST be after express.raw() for the webhook route)
app.use(express.json());

// Health check endpoint for the webhook handler itself
app.get('/api/webhooks/health', (req, res) => {
  res.status(200).json({ status: 'Webhook handler is active' });
});

// Catch-all for undefined routes within this handler's scope
app.use('*', (req, res) => {
  console.log(`[WEBHOOK] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json(safeSerialize({ error: 'Webhook route not found' }));
});

/**
 * Helper function to update the processing status in DynamoDB.
 * @param {string} eventId
 * @param {string} status
 * @param {Error|null} error - Optional error object
 * @param {Array|null} tickets - Optional push tickets array
 */
async function updateWebhookStatus(eventId, status, error = null, tickets = null) {
  try {
    const now = new Date().toISOString();
    const params = {
      TableName: webhooksTableName,
      Key: { eventId: eventId },
      UpdateExpression:
        'set processingStatus = :status, processingEndedAt = :ts' +
        (status === 'processing_push' ? ', processingStartedAt = :ts' : '') + // Set start time only on first processing step
        (error ? ', processingError = :err' : '') +
        (tickets ? ', pushTickets = :tickets' : ''),
      ExpressionAttributeValues: {
        ':status': status,
        ':ts': now,
        ...(error && { ':err': safeSerialize(error) }), // Safely serialize error
        ...(tickets && { ':tickets': tickets }),
      },
      ReturnValues: 'UPDATED_NEW', // Optional: To log the updated item
    };
    // Remove null attributes from ExpressionAttributeValues if they exist
    if (!error) delete params.ExpressionAttributeValues[':err'];
    if (!tickets) delete params.ExpressionAttributeValues[':tickets'];

    await docClient.send(new UpdateCommand(params));
    console.log(`[DB Update ${eventId}] Status updated to "${status}"`);
  } catch (dbError) {
    // Log failure to update status, but don't let it crash the main flow
    console.error(`[DB Update ${eventId}] FAILED to update status to "${status}":`, dbError);
  }
}

module.exports.handler = serverless(app);
