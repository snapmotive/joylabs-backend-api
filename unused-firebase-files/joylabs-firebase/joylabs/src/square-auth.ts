import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Client, Environment } from 'square';
import * as crypto from 'crypto';
import axios from 'axios';
import * as corsModule from 'cors';
import { createFirebaseAuthToken } from './firebase-auth';

const corsHandler = corsModule.default({ origin: true });

// Store PKCE verifiers temporarily (in production, use Firestore or another persistent store)
const codeVerifiers: { [key: string]: string } = {};

// Function to generate PKCE code verifier and challenge
const generatePKCE = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return { verifier, challenge };
};

// Initiate Square OAuth flow for web clients
export const initiateSquareAuth = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get config values or use defaults
      const squareEnvironment = functions.config().square?.environment || 'sandbox';
      const squareAppId = functions.config().square?.app_id;
      
      if (!squareAppId) {
        return res.status(500).json({ error: 'Square app ID not configured' });
      }
      
      // Generate state parameter to prevent CSRF
      const state = crypto.randomBytes(16).toString('hex');
      
      // Generate PKCE values
      const { verifier, challenge } = generatePKCE();
      
      // Store the code verifier with the state for later verification
      codeVerifiers[state] = verifier;
      
      // Set expiration for the stored verifier (10 minutes)
      setTimeout(() => {
        delete codeVerifiers[state];
      }, 10 * 60 * 1000);
      
      // Build the authorization URL
      const baseUrl = squareEnvironment === 'production'
        ? 'https://connect.squareup.com'
        : 'https://connect.squareupsandbox.com';
      
      const authUrl = `${baseUrl}/oauth2/authorize?` +
        `client_id=${squareAppId}` +
        `&scope=MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE` +
        `&state=${state}` +
        `&code_challenge=${challenge}` +
        `&code_challenge_method=S256` +
        `&response_type=code`;
      
      // Redirect to Square
      res.redirect(authUrl);
    } catch (error) {
      console.error('Error initiating Square OAuth:', error);
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  });
});

// Handle Square OAuth callback
export const squareCallback = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing authorization code or state' });
      }
      
      // Retrieve the code verifier using the state parameter
      const verifier = codeVerifiers[state as string];
      
      if (!verifier) {
        return res.status(400).json({ error: 'Invalid state parameter or session expired' });
      }
      
      // Clean up the used verifier
      delete codeVerifiers[state as string];
      
      // Get configuration values
      const squareAppId = functions.config().square?.app_id;
      const squareAppSecret = functions.config().square?.app_secret;
      const squareEnvironment = functions.config().square?.environment || 'sandbox';
      const frontendUrl = functions.config().app?.frontend_url || 'https://joylabs.app';
      
      if (!squareAppId || !squareAppSecret) {
        return res.status(500).json({ error: 'Square app credentials not configured' });
      }
      
      // Determine Square API URL based on environment
      const tokenUrl = squareEnvironment === 'production'
        ? 'https://connect.squareup.com/oauth2/token'
        : 'https://connect.squareupsandbox.com/oauth2/token';
      
      // Exchange authorization code for tokens
      const tokenResponse = await axios.post(tokenUrl, {
        client_id: squareAppId,
        client_secret: squareAppSecret,
        code,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      });
      
      const { access_token, refresh_token, expires_at, merchant_id } = tokenResponse.data;
      
      // Initialize Square client with the access token
      const squareClient = new Client({
        accessToken: access_token,
        environment: squareEnvironment === 'production' ? Environment.Production : Environment.Sandbox
      });
      
      // Get merchant information
      const { result } = await squareClient.merchantsApi.retrieveMerchant(merchant_id);
      
      if (!result.merchant) {
        throw new Error('Merchant information not found');
      }
      
      const { merchant } = result;
      
      // Save merchant data and tokens to Firestore
      await admin.firestore().collection('merchants').doc(merchant_id).set({
        merchantId: merchant_id,
        businessName: merchant.businessName || '',
        country: merchant.country || '',
        languageCode: merchant.languageCode || '',
        currencyCode: merchant.currency || '',
        squareAccessToken: access_token,
        squareRefreshToken: refresh_token,
        squareTokenExpiresAt: expires_at,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      // Create a Firebase Auth user and token
      const merchantData = {
        merchantName: merchant.businessName || '',
        // Square merchant object may not have email/logoUrl directly available in the type
        // Use only the business name for now
      };
      
      const firebaseToken = await createFirebaseAuthToken(merchant_id, merchantData);
      
      // Redirect to frontend with success parameter and token
      res.redirect(`${frontendUrl}/auth/square/success?merchantId=${merchant_id}&token=${firebaseToken}`);
    } catch (error) {
      console.error('Error processing Square callback:', error);
      const frontendUrl = functions.config().app?.frontend_url || 'https://joylabs.app';
      res.redirect(`${frontendUrl}/auth/square/error?message=${encodeURIComponent('Failed to complete OAuth flow')}`);
    }
  });
});

// Initiate Square OAuth flow for mobile clients
export const initiateMobileAuth = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get config values or use defaults
      const squareEnvironment = functions.config().square?.environment || 'sandbox';
      const squareAppId = functions.config().square?.app_id;
      
      if (!squareAppId) {
        return res.status(500).json({ error: 'Square app ID not configured' });
      }
      
      // Extract client parameters
      const { codeChallenge, state } = req.query;
      
      if (!codeChallenge || !state) {
        return res.status(400).json({ error: 'Missing code challenge or state parameter' });
      }
      
      // Build the authorization URL
      const baseUrl = squareEnvironment === 'production'
        ? 'https://connect.squareup.com'
        : 'https://connect.squareupsandbox.com';
      
      const authUrl = `${baseUrl}/oauth2/authorize?` +
        `client_id=${squareAppId}` +
        `&scope=MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256` +
        `&response_type=code`;
      
      // Return the authorization URL to the mobile client
      res.json({ authUrl });
    } catch (error) {
      console.error('Error initiating mobile Square OAuth:', error);
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  });
});

// Handle Square OAuth callback for mobile clients
export const mobileCallback = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const { code, state, code_verifier } = req.query;
      
      if (!code || !state || !code_verifier) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Get configuration values
      const squareAppId = functions.config().square?.app_id;
      const squareAppSecret = functions.config().square?.app_secret;
      const squareEnvironment = functions.config().square?.environment || 'sandbox';
      
      if (!squareAppId || !squareAppSecret) {
        return res.status(500).json({ error: 'Square app credentials not configured' });
      }
      
      // Determine Square API URL based on environment
      const tokenUrl = squareEnvironment === 'production'
        ? 'https://connect.squareup.com/oauth2/token'
        : 'https://connect.squareupsandbox.com/oauth2/token';
      
      // Exchange authorization code for tokens
      const tokenResponse = await axios.post(tokenUrl, {
        client_id: squareAppId,
        client_secret: squareAppSecret,
        code,
        grant_type: 'authorization_code',
        code_verifier: code_verifier as string,
      });
      
      const { access_token, refresh_token, expires_at, merchant_id } = tokenResponse.data;
      
      // Initialize Square client with the access token
      const squareClient = new Client({
        accessToken: access_token,
        environment: squareEnvironment === 'production' ? Environment.Production : Environment.Sandbox
      });
      
      // Get merchant information
      const { result } = await squareClient.merchantsApi.retrieveMerchant(merchant_id);
      
      if (!result.merchant) {
        throw new Error('Merchant information not found');
      }
      
      const { merchant } = result;
      
      // Save merchant data and tokens to Firestore
      await admin.firestore().collection('merchants').doc(merchant_id).set({
        merchantId: merchant_id,
        businessName: merchant.businessName || '',
        country: merchant.country || '',
        languageCode: merchant.languageCode || '',
        currencyCode: merchant.currency || '',
        squareAccessToken: access_token,
        squareRefreshToken: refresh_token,
        squareTokenExpiresAt: expires_at,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      // Create a Firebase Auth user and token
      const merchantData = {
        merchantName: merchant.businessName || '',
        // Square merchant object may not have email/logoUrl directly available in the type
        // Use only the business name for now
      };
      
      const firebaseToken = await createFirebaseAuthToken(merchant_id, merchantData);
      
      // Return the tokens to the mobile client
      res.json({
        success: true,
        merchantId: merchant_id,
        firebaseToken
      });
    } catch (error) {
      console.error('Error processing mobile Square callback:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to complete OAuth flow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}); 