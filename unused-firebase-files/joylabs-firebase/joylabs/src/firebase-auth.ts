import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';

// Create a custom token for Square merchants
export const createFirebaseAuthToken = async (
  merchantId: string, 
  squareData: any
): Promise<string> => {
  try {
    // Check if user already exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUser(`square_${merchantId}`);
      logger.info(`Found existing user for Square merchant ${merchantId}`);
    } catch (error) {
      // User doesn't exist, create a new one
      logger.info(`Creating new user for Square merchant ${merchantId}`);
      userRecord = await admin.auth().createUser({
        uid: `square_${merchantId}`,
        displayName: squareData.merchantName || `Square Merchant ${merchantId}`,
        // Add email if available from Square
        ...(squareData.email && { email: squareData.email }),
        // Optional: Add photo URL if available
        ...(squareData.profileImage && { photoURL: squareData.profileImage }),
      });
    }

    // Create custom claims with Square data
    const customClaims = {
      squareMerchantId: merchantId,
      merchantType: 'square',
      // Add any other relevant Square information as claims
    };

    // Set custom claims for the user
    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

    // Generate a custom Firebase token for this user
    const token = await admin.auth().createCustomToken(userRecord.uid, customClaims);
    
    return token;
  } catch (error) {
    logger.error('Error creating Firebase auth token:', error);
    throw new Error('Failed to create authentication token');
  }
};

// Verify a Firebase ID token and return the user data
export const verifyFirebaseToken = async (idToken: string): Promise<admin.auth.DecodedIdToken> => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Error verifying Firebase ID token:', error);
    throw new Error('Invalid Firebase authentication token');
  }
};

// Get a user by Square merchant ID
export const getUserBySquareMerchantId = async (merchantId: string) => {
  try {
    const userRecord = await admin.auth().getUser(`square_${merchantId}`);
    return userRecord;
  } catch (error) {
    logger.error(`Error getting user for Square merchant ${merchantId}:`, error);
    return null;
  }
};

// Delete a user by Square merchant ID
export const deleteUserBySquareMerchantId = async (merchantId: string): Promise<void> => {
  try {
    await admin.auth().deleteUser(`square_${merchantId}`);
    logger.info(`Deleted user for Square merchant ${merchantId}`);
  } catch (error) {
    logger.error(`Error deleting user for Square merchant ${merchantId}:`, error);
    throw new Error('Failed to delete user');
  }
}; 