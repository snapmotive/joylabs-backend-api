# JoyLabs Firebase Backend

This repository contains the Firebase Cloud Functions that power the JoyLabs backend, handling Square OAuth integration and related services.

## Project Structure

- `src/` - Source code for Firebase Cloud Functions
  - `index.ts` - Main entry point that exports all functions
  - `square-auth.ts` - Square OAuth authentication flow
  - `square-webhooks.ts` - Square webhook handlers
  - `square-utils.ts` - Utilities for Square integration (token refresh)
  - `firebase-auth.ts` - Firebase Authentication integration
  - `health.ts` - Health check endpoint
  - `logging.ts` - Logging utilities

## Prerequisites

- Node.js (version 18 or higher)
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with the Blaze plan (required for Cloud Functions)
- A Square Developer account with an OAuth application

## Configuration

### Environment Setup

Before deploying, you need to set up environment configuration variables:

```bash
# Login to Firebase
firebase login

# Select your project
firebase use YOUR_PROJECT_ID

# Configure Square application settings
firebase functions:config:set square.app_id="YOUR_SQUARE_APP_ID" \
                          square.app_secret="YOUR_SQUARE_APP_SECRET" \
                          square.environment="sandbox" \
                          app.frontend_url="https://your-app-domain.com"

# To use production Square environment:
# firebase functions:config:set square.environment="production"
```

### Square Developer Setup

1. Go to the [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Create or select your application
3. Configure OAuth settings:
   - Set the OAuth Redirect URL to: `https://YOUR_FIREBASE_REGION-YOUR_PROJECT_ID.cloudfunctions.net/squareCallback`
   - For mobile apps, also add: `https://YOUR_FIREBASE_REGION-YOUR_PROJECT_ID.cloudfunctions.net/mobileCallback`
4. Note your Application ID and Application Secret for the Firebase config

## Local Development

```bash
# Install dependencies
npm install

# Start local emulator
npm run serve
```

## Deployment

```bash
# Deploy all functions to production
npm run deploy

# Deploy specific functions
firebase deploy --only functions:initiateSquareAuth,functions:squareCallback

# View logs
firebase functions:log
```

After deployment, note the function URLs provided in the output. You'll need these for your frontend integration.

## Monitoring and Debugging

### Health Check

A health check endpoint is provided at:
```
https://YOUR_FIREBASE_REGION-YOUR_PROJECT_ID.cloudfunctions.net/healthCheck
```

This endpoint checks:
- Firebase Authentication connectivity
- Firestore database connectivity
- Square API connectivity
- Configuration status

### Logs

Logs are available in two places:

1. **Firebase Console**: Go to Functions > Logs in the Firebase Console
2. **Firestore Database**: In the `system_logs` collection, which stores structured logs

### Common Issues

1. **Square OAuth Errors**: Check that your Square App ID and Secret are correctly configured
2. **Function Timeout**: If functions time out, consider increasing the timeout in `firebase.json`
3. **CORS Issues**: If experiencing CORS errors, verify your frontend URL in the configuration

## Security

- All sensitive data (tokens, credentials) should be stored in Firestore with appropriate security rules
- Firebase Authentication provides user identification and authorization
- Square tokens are automatically refreshed before they expire

## Frontend Integration

For the frontend to connect with this backend:

1. Use the Firebase SDK to initialize Firebase in your app
2. To start Square OAuth:
   - Web: Redirect to the `initiateSquareAuth` function URL
   - Mobile: Use the `initiateMobileAuth` endpoint with PKCE parameters

Example for web:
```javascript
// Redirect to Square OAuth
window.location.href = 'https://YOUR_FIREBASE_REGION-YOUR_PROJECT_ID.cloudfunctions.net/initiateSquareAuth';
```

Example for mobile React Native:
```javascript
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Generate PKCE values
const generateCodeVerifier = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const generateCodeChallenge = async (verifier) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier
  );
  return btoa(digest)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// Start OAuth flow
const startOAuth = async () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier(); // Random state
  
  const response = await fetch(
    `https://YOUR_FIREBASE_REGION-YOUR_PROJECT_ID.cloudfunctions.net/initiateMobileAuth?codeChallenge=${codeChallenge}&state=${state}`
  );
  const data = await response.json();
  
  // Store verifier and state for later
  await AsyncStorage.setItem('square_code_verifier', codeVerifier);
  await AsyncStorage.setItem('square_state', state);
  
  // Open browser for OAuth
  await WebBrowser.openAuthSessionAsync(data.authUrl);
};
```

## License

This project is proprietary and confidential. Unauthorized copying or distribution is prohibited. 