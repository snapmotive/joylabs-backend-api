/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as functionsV1 from 'firebase-functions/v1';

// Initialize Firebase
admin.initializeApp();

// Import Square auth functions
import { 
  squareCallback, 
  initiateSquareAuth, 
  initiateMobileAuth, 
  mobileCallback 
} from './square-auth';

// Import Square webhook handler
import { handleWebhook } from './square-webhooks';

// Import Firebase auth functions
import {
  createFirebaseAuthToken,
  verifyFirebaseToken,
  getUserBySquareMerchantId
} from './firebase-auth';

// Import Square utility functions
import { 
  refreshSquareToken, 
  scheduledTokenRefresh 
} from './square-utils';

// Import health check
import { healthCheck } from './health';

// Import logging utilities
import { 
  logEvent, 
  logAuthEvent, 
  logSquareEvent, 
  logError,
  LogLevel,
  EventType
} from './logging';

// Create a function to verify Firebase Auth tokens (using v1 functions)
export const verifyAuth = functionsV1.https.onCall((data, context) => {
  try {
    // If auth context exists, the token is already verified by Firebase
    if (context.auth) {
      // Log successful authentication
      void logAuthEvent(
        LogLevel.INFO,
        'User authenticated via custom token',
        { uid: context.auth.uid },
        context.auth.uid
      );
      
      return {
        success: true,
        user: {
          uid: context.auth.uid,
          // Include any other user data you need
          customClaims: context.auth.token
        }
      };
    }

    // Log failed authentication
    void logAuthEvent(
      LogLevel.WARNING,
      'Authentication failed - no auth context',
      { ip: context.rawRequest?.ip }
    );

    // Otherwise, return unauthorized
    throw new functionsV1.https.HttpsError(
      'unauthenticated',
      'Unauthorized'
    );
  } catch (error) {
    // Log error
    void logError(
      EventType.AUTH,
      'Authentication error in verifyAuth',
      error
    );
    
    logger.error('Error verifying auth', error);
    throw new functionsV1.https.HttpsError(
      'unauthenticated',
      'Failed to verify authentication'
    );
  }
});

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Export the functions
export {
  initiateSquareAuth,
  squareCallback,
  initiateMobileAuth,
  mobileCallback,
  handleWebhook,
  scheduledTokenRefresh,
  healthCheck
};
