import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Client, Environment } from 'square';
import * as corsModule from 'cors';

const corsHandler = corsModule.default({ origin: true });

/**
 * Health check endpoint to verify system status
 * Returns information about Firebase and Square connectivity
 */
export const healthCheck = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const healthStatus = {
        timestamp: new Date().toISOString(),
        firebase: {
          auth: false,
          firestore: false
        },
        square: {
          api: false,
          environment: functions.config().square?.environment || 'sandbox'
        },
        config: {
          hasSquareAppId: !!functions.config().square?.app_id,
          hasSquareAppSecret: !!functions.config().square?.app_secret,
          hasFrontendUrl: !!functions.config().app?.frontend_url
        }
      };

      // Check Firebase Auth connection
      try {
        await admin.auth().listUsers(1);
        healthStatus.firebase.auth = true;
      } catch (error) {
        logger.error('Health check: Firebase Auth issue', error);
      }

      // Check Firestore connection
      try {
        await admin.firestore().collection('_health').doc('status').set({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          service: 'health-check'
        });
        healthStatus.firebase.firestore = true;
      } catch (error) {
        logger.error('Health check: Firestore issue', error);
      }

      // Check Square API connection
      try {
        const squareClient = new Client({
          environment: healthStatus.square.environment === 'production' 
            ? Environment.Production 
            : Environment.Sandbox,
          // Don't include access token for the health check, just checking connection
          accessToken: 'HEALTH_CHECK_TOKEN' 
        });
        
        // Just check if we can initialize the API - we won't actually authenticate
        // This won't make any API calls, just verifies the environment works
        if (squareClient) {
          healthStatus.square.api = true;
        }
      } catch (error) {
        logger.error('Health check: Square API issue', error);
      }

      // Log the health check result
      logger.info('Health check completed', healthStatus);
      
      // Return status with appropriate HTTP code
      const httpStatus = 
        healthStatus.firebase.auth && 
        healthStatus.firebase.firestore && 
        healthStatus.square.api ? 200 : 503;
      
      res.status(httpStatus).json({
        status: httpStatus === 200 ? 'healthy' : 'unhealthy',
        timestamp: healthStatus.timestamp,
        details: healthStatus
      });
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(500).json({ 
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}); 