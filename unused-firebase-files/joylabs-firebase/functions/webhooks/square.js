const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Client, Environment } = require('square');
const crypto = require('crypto');
const cors = require('cors')({ origin: true });

// Handle Square webhooks
exports.handleWebhook = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // Verify the webhook signature
      const squareSignature = req.headers['x-square-signature'];
      
      if (!squareSignature) {
        console.error('Webhook received without Square signature header');
        return res.status(401).send('No signature header');
      }
      
      // Get the webhook signing key from Firebase config
      const signingKey = functions.config().square.webhook_signature_key;
      
      if (!signingKey) {
        console.error('Webhook signature key not configured');
        return res.status(500).send('Webhook signature verification not configured');
      }
      
      // Calculate the signature and compare
      const requestBody = JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', signingKey);
      const calculatedSignature = hmac.update(requestBody).digest('base64');
      
      if (calculatedSignature !== squareSignature) {
        console.error('Invalid webhook signature');
        return res.status(401).send('Invalid signature');
      }
      
      // Parse the webhook event
      const { event_type, merchant_id, data } = req.body;
      
      // Log the webhook event
      console.log(`Received Square webhook: ${event_type} for merchant ${merchant_id}`);
      
      // Store the webhook in Firestore for audit/debugging
      await admin.firestore().collection('webhooks').add({
        merchantId: merchant_id,
        eventType: event_type,
        data,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Process different webhook types
      switch (event_type) {
        case 'payment.created':
          await handlePaymentCreated(merchant_id, data);
          break;
          
        case 'payment.updated':
          await handlePaymentUpdated(merchant_id, data);
          break;
          
        case 'order.created':
          await handleOrderCreated(merchant_id, data);
          break;
          
        case 'order.updated':
          await handleOrderUpdated(merchant_id, data);
          break;
          
        // Add other webhook event handlers as needed
        
        default:
          console.log(`Unhandled webhook event type: ${event_type}`);
      }
      
      // Always acknowledge the webhook to prevent retries
      res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Error processing Square webhook:', error);
      res.status(500).send('Webhook processing failed');
    }
  });
});

// Handle payment.created webhook
async function handlePaymentCreated(merchantId, data) {
  try {
    const { payment } = data.object;
    
    // Store payment in Firestore
    await admin.firestore().collection('merchants').doc(merchantId)
      .collection('payments').doc(payment.id).set({
        paymentId: payment.id,
        status: payment.status,
        orderId: payment.order_id,
        amount: payment.amount_money,
        createdAt: admin.firestore.Timestamp.fromDate(new Date(payment.created_at)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawData: payment
      });
      
    console.log(`Payment ${payment.id} created for merchant ${merchantId}`);
  } catch (error) {
    console.error(`Error handling payment.created webhook for merchant ${merchantId}:`, error);
  }
}

// Handle payment.updated webhook
async function handlePaymentUpdated(merchantId, data) {
  try {
    const { payment } = data.object;
    
    // Update payment in Firestore
    await admin.firestore().collection('merchants').doc(merchantId)
      .collection('payments').doc(payment.id).update({
        status: payment.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawData: payment
      });
      
    console.log(`Payment ${payment.id} updated for merchant ${merchantId}`);
  } catch (error) {
    console.error(`Error handling payment.updated webhook for merchant ${merchantId}:`, error);
  }
}

// Handle order.created webhook
async function handleOrderCreated(merchantId, data) {
  try {
    const { order } = data.object;
    
    // Store order in Firestore
    await admin.firestore().collection('merchants').doc(merchantId)
      .collection('orders').doc(order.id).set({
        orderId: order.id,
        locationId: order.location_id,
        customerId: order.customer_id,
        state: order.state,
        total: order.total_money,
        createdAt: admin.firestore.Timestamp.fromDate(new Date(order.created_at)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawData: order
      });
      
    console.log(`Order ${order.id} created for merchant ${merchantId}`);
  } catch (error) {
    console.error(`Error handling order.created webhook for merchant ${merchantId}:`, error);
  }
}

// Handle order.updated webhook
async function handleOrderUpdated(merchantId, data) {
  try {
    const { order } = data.object;
    
    // Update order in Firestore
    await admin.firestore().collection('merchants').doc(merchantId)
      .collection('orders').doc(order.id).update({
        state: order.state,
        total: order.total_money,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawData: order
      });
      
    console.log(`Order ${order.id} updated for merchant ${merchantId}`);
  } catch (error) {
    console.error(`Error handling order.updated webhook for merchant ${merchantId}:`, error);
  }
} 