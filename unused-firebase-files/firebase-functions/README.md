# JoyLabs Firebase Backend for Square OAuth

This repository contains Firebase Cloud Functions for Square OAuth integration with the JoyLabs mobile app.

## Setup Instructions

### Prerequisites

1. Install Node.js and npm (Node v18+ recommended)
2. Install Firebase CLI: `npm install -g firebase-tools`
3. A Square Developer account and application
4. Firebase project with Blaze plan (needed for external API calls)

### Project Setup

1. Clone this repository
2. Log in to Firebase CLI:
   ```
   firebase login
   ```
3. Select your Firebase project:
   ```
   firebase use joylabs-be
   ```

### Configuration

1. Set up Square credentials in Firebase:
   ```
   firebase functions:config:set square.app_id="YOUR_SQUARE_APP_ID" \
                         square.app_secret="YOUR_SQUARE_APP_SECRET" \
                         square.environment="sandbox" \
                         app.frontend_url="joylabs://square-callback"
   ```

   Replace `YOUR_SQUARE_APP_ID` and `YOUR_SQUARE_APP_SECRET` with your actual Square application credentials.

2. Make sure to set the redirect URL in the Square Developer Dashboard to:
   ```
   https://us-central1-joylabs-be.cloudfunctions.net/squareCallback
   ```

### Fix Linting Errors

Before deploying, fix linting errors:

```
cd functions
npm run lint -- --fix
```

### Deployment

**IMPORTANT**: Your Firebase project must be on the Blaze (pay-as-you-go) plan to deploy functions that call external APIs like Square. 

To upgrade your project to the Blaze plan:
1. Visit https://console.firebase.google.com/project/joylabs-be/usage/details
2. Click "Upgrade" and follow the instructions to set up billing

After upgrading to the Blaze plan, deploy your functions:

```
firebase deploy --only functions
```

After deployment, you should see the function URLs that you need to use in your frontend app.

## Firebase Functions

- `initiateSquareAuth` - Start the OAuth flow for web applications
- `squareCallback` - Handle OAuth callback for web applications
- `initiateMobileAuth` - Start the OAuth flow for mobile apps with PKCE
- `mobileCallback` - Handle OAuth callback for mobile apps with PKCE
- `healthCheck` - Simple health check endpoint

## Frontend Integration

In your React Native app, you'll need to:

1. Set up deep linking with the `joylabs://` URL scheme
2. Create a Square callback route to handle the OAuth redirect
3. Use the OAuth endpoints for authentication

See the provided frontend code in the `/Users/danielhan/joylabs/joylabs-frontend` directory.

## Security

The integration uses PKCE (Proof Key for Code Exchange) for enhanced security with mobile apps, which protects against authorization code interception attacks.

## Troubleshooting

If you encounter issues:

1. Check Firebase function logs: `firebase functions:log`
2. Verify your Square application credentials
3. Ensure your Firebase project is on the Blaze plan
4. Confirm the redirect URLs are correctly set in Square Developer Dashboard 