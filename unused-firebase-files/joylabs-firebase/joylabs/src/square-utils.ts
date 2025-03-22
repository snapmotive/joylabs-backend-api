import * as functions from 'firebase-functions';
import * as functionsV1 from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as logger from 'firebase-functions/logger';

/**
 * Refreshes a Square access token using the refresh token
 * @param merchantId The Square merchant ID
 * @returns The updated tokens
 */
export const refreshSquareToken = async (merchantId: string) => {
  try {
    // Get merchant data from Firestore
    const merchantDoc = await admin.firestore().collection('merchants').doc(merchantId).get();
    
    if (!merchantDoc.exists) {
      throw new Error(`Merchant ${merchantId} not found`);
    }
    
    const merchantData = merchantDoc.data();
    
    if (!merchantData || !merchantData.squareRefreshToken) {
      throw new Error(`No refresh token available for merchant ${merchantId}`);
    }
    
    // Get configuration values
    const squareAppId = functions.config().square?.app_id;
    const squareAppSecret = functions.config().square?.app_secret;
    const squareEnvironment = functions.config().square?.environment || 'sandbox';
    
    if (!squareAppId || !squareAppSecret) {
      throw new Error('Square app credentials not configured');
    }
    
    // Determine Square API URL based on environment
    const tokenUrl = squareEnvironment === 'production'
      ? 'https://connect.squareup.com/oauth2/token'
      : 'https://connect.squareupsandbox.com/oauth2/token';
    
    // Request a new access token using the refresh token
    const refreshResponse = await axios.post(tokenUrl, {
      client_id: squareAppId,
      client_secret: squareAppSecret,
      refresh_token: merchantData.squareRefreshToken,
      grant_type: 'refresh_token'
    });
    
    const { access_token, refresh_token, expires_at } = refreshResponse.data;
    
    // Update the merchant's tokens in Firestore
    await admin.firestore().collection('merchants').doc(merchantId).update({
      squareAccessToken: access_token,
      squareRefreshToken: refresh_token,
      squareTokenExpiresAt: expires_at,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`Successfully refreshed tokens for merchant ${merchantId}`);
    
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at
    };
  } catch (error) {
    logger.error(`Error refreshing token for merchant ${merchantId}:`, error);
    throw new Error(`Failed to refresh Square token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Scheduled Cloud Function to refresh tokens that are about to expire
 */
export const scheduledTokenRefresh = functionsV1.pubsub.schedule('every 12 hours').onRun(async (context: any) => {
  try {
    // Get all merchants with tokens that expire in the next 24 hours
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    
    const expiringTokensSnapshot = await admin.firestore()
      .collection('merchants')
      .where('squareTokenExpiresAt', '>', now.toISOString())
      .where('squareTokenExpiresAt', '<', tomorrow.toISOString())
      .get();
    
    if (expiringTokensSnapshot.empty) {
      logger.info('No tokens need to be refreshed at this time');
      return null;
    }
    
    // Refresh each token
    const refreshPromises = expiringTokensSnapshot.docs.map(async (doc) => {
      const merchantId = doc.id;
      try {
        await refreshSquareToken(merchantId);
        logger.info(`Scheduled refresh successful for merchant ${merchantId}`);
      } catch (error) {
        logger.error(`Scheduled refresh failed for merchant ${merchantId}:`, error);
      }
    });
    
    await Promise.all(refreshPromises);
    
    logger.info(`Completed scheduled token refresh for ${refreshPromises.length} merchants`);
    return null;
  } catch (error) {
    logger.error('Error in scheduled token refresh:', error);
    return null;
  }
}); 