/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as logger from "firebase-functions/logger";

// Initialize Firebase
admin.initializeApp();

// Import Square auth functions
import {
  initiateSquareAuth,
  squareCallback,
  initiateMobileAuth,
  mobileCallback,
} from "./square-auth";

// Export Square auth functions
export {
  initiateSquareAuth,
  squareCallback,
  initiateMobileAuth,
  mobileCallback,
};

// Health check endpoint
export const healthCheck = functions.https.onRequest((req, res) => {
  logger.info("Health check requested", {structuredData: true});
  res.status(200).json({
    status: "healthy",
    timestamp: Date.now(),
    env: process.env.NODE_ENV || "development",
  });
});
