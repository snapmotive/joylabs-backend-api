import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import cors from "cors";

// Import square SDK using require to avoid TypeScript issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {Client, Environment} = require("square");

const corsHandler = cors({origin: true});

// Store the PKCE and state parameters temporarily for validation
// In a production app, you would want to use Firestore for this
const pkceStore: Record<string, {
  codeVerifier: string,
  state: string,
  redirectUri?: string,
}> = {};

// Function to generate a random string for state parameter
const generateRandomString = (length = 32): string => {
  return crypto.randomBytes(length).toString("hex");
};

// Function to validate that the redirect URI is from your app
const isValidRedirectUri = (uri: string): boolean => {
  // For development in Expo Go
  if (uri.startsWith("exp://")) return true;

  // For your actual app scheme
  if (uri.startsWith("joylabs://")) return true;

  return false;
};

// Initiate Square OAuth flow
export const initiateSquareAuth = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get the environment from Firebase config
      const environment = functions.config().square?.environment || "sandbox";
      const appId = functions.config().square?.app_id;
      const squareEnv = environment === "production" ?
        Environment.Production : Environment.Sandbox;

      if (!appId) {
        return res.status(500).json({
          error: "Missing Square app configuration. " +
            "Please set up firebase functions:config:set square.app_id",
        });
      }

      // Get parameters from the request
      const redirectUri = req.query.redirect_uri as string;
      const codeChallenge = req.query.code_challenge as string;
      const codeVerifier = req.query.code_verifier as string;

      // Validate redirect URI
      if (redirectUri && !isValidRedirectUri(redirectUri)) {
        return res.status(400).json({error: "Invalid redirect URI"});
      }

      // Generate state parameter
      const state = generateRandomString();

      // Store PKCE parameters
      pkceStore[state] = {
        codeVerifier: codeVerifier || "",
        state,
        redirectUri,
      };

      // Build the Square OAuth URL
      const squareClient = new Client({
        environment: squareEnv,
      });
      const oauthApi = squareClient.oAuthApi;

      // Permissions to request
      const scopes = [
        "ITEMS_READ",
        "MERCHANT_PROFILE_READ",
        "INVENTORY_READ",
      ];

      // Build the authorization URL
      let authUrl = oauthApi.buildAuthorizeUri({
        clientId: appId,
        state,
        scopes,
      });

      // Add code challenge if provided (for PKCE)
      if (codeChallenge) {
        const url = new URL(authUrl.href);
        url.searchParams.append("code_challenge", codeChallenge);
        url.searchParams.append("code_challenge_method", "S256");
        authUrl = new URL(url.toString());
      }

      // Set the redirect URI if provided
      if (redirectUri) {
        const url = new URL(authUrl.href);
        url.searchParams.set("redirect_uri", redirectUri);
        authUrl = new URL(url.toString());
      }

      // Return the auth URL
      return res.status(200).json({
        auth_url: authUrl.toString(),
        state,
      });
    } catch (error) {
      console.error("Error initiating Square auth:", error);
      return res.status(500).json({
        error: "Failed to initiate Square authorization",
      });
    }
  });
});

// Handle Square OAuth callback
export const squareCallback = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get environment from Firebase config
      const environment = functions.config().square?.environment || "sandbox";
      const appId = functions.config().square?.app_id;
      const appSecret = functions.config().square?.app_secret;
      const squareEnv = environment === "production" ?
        Environment.Production : Environment.Sandbox;

      if (!appId || !appSecret) {
        return res.status(500).json({
          error: "Missing Square app configuration",
        });
      }

      // Get parameters from the request
      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;
      const codeVerifier = req.query.code_verifier as string;

      if (error) {
        return res.status(400).json({
          error: `Square authorization error: ${error}`,
        });
      }

      if (!code) {
        return res.status(400).json({error: "Missing authorization code"});
      }

      if (!state) {
        return res.status(400).json({error: "Missing state parameter"});
      }

      // Validate state parameter
      const storedParams = pkceStore[state];
      if (!storedParams) {
        return res.status(400).json({error: "Invalid state parameter"});
      }

      // Validate code verifier if provided
      if (codeVerifier &&
          storedParams.codeVerifier &&
          codeVerifier !== storedParams.codeVerifier) {
        return res.status(400).json({error: "Invalid code verifier"});
      }

      // Initialize Square client
      const squareClient = new Client({
        environment: squareEnv,
        squareVersion: "2023-12-13",
      });

      // Exchange the code for an access token
      const {result} = await squareClient.oAuthApi.obtainToken({
        clientId: appId,
        clientSecret: appSecret,
        code,
        redirectUri: storedParams.redirectUri,
        codeVerifier: storedParams.codeVerifier || undefined,
        grantType: "authorization_code",
      });

      if (!result.accessToken) {
        return res.status(400).json({error: "Failed to obtain access token"});
      }

      // Clean up the store
      delete pkceStore[state];

      // Save the token in Firestore for future use
      const db = admin.firestore();
      await db.collection("square_tokens").doc(result.merchantId).set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + (result.expiresIn * 1000),
        tokenType: result.tokenType,
        merchantId: result.merchantId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // For mobile app, redirect with the token data
      if (storedParams.redirectUri) {
        // Construct redirect URL with success parameter
        const redirectUrl = new URL(storedParams.redirectUri);
        redirectUrl.searchParams.append("success", "true");
        redirectUrl.searchParams.append("merchant_id", result.merchantId);

        return res.redirect(redirectUrl.toString());
      }

      // For web app or API call
      return res.status(200).json({
        success: true,
        merchant_id: result.merchantId,
      });
    } catch (error) {
      console.error("Error handling Square callback:", error);
      return res.status(500).json({
        error: "Failed to complete Square authorization",
      });
    }
  });
});

// For mobile apps - Initialize OAuth with PKCE
export const initiateMobileAuth = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get parameters from the request
      const codeChallenge = req.query.code_challenge as string;
      const state = req.query.state as string;

      if (!codeChallenge || !state) {
        return res.status(400).json({
          error: "Missing required parameters: " +
            "code_challenge and state are required",
        });
      }

      // Get environment from Firebase config
      const environment = functions.config().square?.environment || "sandbox";
      const appId = functions.config().square?.app_id;
      const squareEnv = environment === "production" ?
        Environment.Production : Environment.Sandbox;

      if (!appId) {
        return res.status(500).json({
          error: "Missing Square app configuration",
        });
      }

      // Store the state for later validation
      pkceStore[state] = {
        codeVerifier: "", // Will be provided in the callback
        state,
      };

      // Initialize Square client
      const squareClient = new Client({
        environment: squareEnv,
      });

      // Define scopes
      const scopes = [
        "ITEMS_READ",
        "MERCHANT_PROFILE_READ",
        "INVENTORY_READ",
      ];

      // Build the authorization URL with PKCE
      const authUrl = squareClient.oAuthApi.buildAuthorizeUri({
        clientId: appId,
        state,
        scopes,
      });

      // Add code challenge parameters
      const url = new URL(authUrl.href);
      url.searchParams.append("code_challenge", codeChallenge);
      url.searchParams.append("code_challenge_method", "S256");

      // Return the auth URL
      return res.status(200).json({
        auth_url: url.toString(),
        state,
      });
    } catch (error) {
      console.error("Error initiating mobile Square auth:", error);
      return res.status(500).json({
        error: "Failed to initiate Square authorization",
      });
    }
  });
});

// For mobile apps - Handle the callback with PKCE
export const mobileCallback = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Get parameters from the request
      const code = req.query.code as string;
      const state = req.query.state as string;
      const codeVerifier = req.query.code_verifier as string;
      const error = req.query.error as string;

      if (error) {
        return res.status(400).json({
          error: `Square authorization error: ${error}`,
        });
      }

      if (!code || !state || !codeVerifier) {
        return res.status(400).json({
          error: "Missing required parameters: " +
            "code, state, and code_verifier are required",
        });
      }

      // Validate state parameter
      if (!pkceStore[state]) {
        return res.status(400).json({error: "Invalid state parameter"});
      }

      // Get environment from Firebase config
      const environment = functions.config().square?.environment || "sandbox";
      const appId = functions.config().square?.app_id;
      const appSecret = functions.config().square?.app_secret;
      const squareEnv = environment === "production" ?
        Environment.Production : Environment.Sandbox;

      if (!appId || !appSecret) {
        return res.status(500).json({
          error: "Missing Square app configuration",
        });
      }

      // Initialize Square client
      const squareClient = new Client({
        environment: squareEnv,
        squareVersion: "2023-12-13",
      });

      // Exchange the code for an access token
      const {result} = await squareClient.oAuthApi.obtainToken({
        clientId: appId,
        clientSecret: appSecret,
        code,
        codeVerifier,
        grantType: "authorization_code",
      });

      if (!result.accessToken) {
        return res.status(400).json({error: "Failed to obtain access token"});
      }

      // Clean up the store
      delete pkceStore[state];

      // Save the token in Firestore for future use
      const db = admin.firestore();
      await db.collection("square_tokens").doc(result.merchantId).set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + (result.expiresIn * 1000),
        tokenType: result.tokenType,
        merchantId: result.merchantId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Return success response
      return res.status(200).json({
        success: true,
        merchant_id: result.merchantId,
      });
    } catch (error) {
      console.error("Error handling mobile Square callback:", error);
      return res.status(500).json({
        error: "Failed to complete Square authorization",
      });
    }
  });
});
