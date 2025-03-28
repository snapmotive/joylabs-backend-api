# Square OAuth 2.0 PKCE Implementation Guide
## For Expo Go + AuthSession (No Deep Linking)

### Required Dependencies
```bash
npx expo install expo-auth-session expo-web-browser expo-secure-store expo-crypto
```

### Configuration Setup
```typescript
// config/square.ts
export const SQUARE_CONFIG = {
  apiUrl: 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production',
  // Expo Go will use auth.expo.io as proxy
  redirectUri: AuthSession.makeRedirectUri({
    useProxy: true // Critical for Expo Go!
  }),
  scopes: [
    'MERCHANT_PROFILE_READ',
    'ITEMS_READ',
    'ITEMS_WRITE',
    'ORDERS_READ',
    'ORDERS_WRITE',
    'PAYMENTS_READ',
    'PAYMENTS_WRITE'
  ]
};
```

### Helper Functions
```typescript
// utils/auth.ts
import * as Crypto from 'expo-crypto';

// Generate PKCE code verifier
const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
};

// Generate PKCE code challenge
const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier
  );
  return base64URLEncode(hash);
};
```

### Main Authentication Flow

#### 1. Initiate Auth Flow
```typescript
const initiateSquareAuth = async () => {
  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier(); // Use same function for random state
```

#### 2. Register State with Backend
```typescript
  // Register state/verifier with backend
  await fetch(`${SQUARE_CONFIG.apiUrl}/api/auth/register-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, code_verifier: codeVerifier })
  });
```

#### 3. Get Authorization URL
```typescript
  // Get Square authorization URL
  const authUrlResponse = await fetch(
    `${SQUARE_CONFIG.apiUrl}/api/auth/square/url?` + 
    new URLSearchParams({
      state,
      code_challenge: codeChallenge,
      redirect_uri: SQUARE_CONFIG.redirectUri
    })
  );
  const { url } = await authUrlResponse.json();
```

#### 4. Launch AuthSession
```typescript
  // Launch Square OAuth flow
  const result = await AuthSession.startAsync({
    authUrl: url,
    returnUrl: SQUARE_CONFIG.redirectUri
  });
```

#### 5. Handle Auth Response
```typescript
  // Process the response
  if (result.type === 'success') {
    // Exchange code for token
    const tokenResponse = await fetch(
      `${SQUARE_CONFIG.apiUrl}/api/auth/square/callback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: result.params.code,
          state: result.params.state,
          code_verifier: codeVerifier,
          redirect_uri: SQUARE_CONFIG.redirectUri
        })
      }
    );
    const { token, user } = await tokenResponse.json();
    await SecureStore.setItemAsync('userToken', token);
    return { token, user };
  }
```

### Required Backend Endpoints

1. **State Registration Endpoint**
- Path: `POST /api/auth/register-state`
- Purpose: Store state and code_verifier (10-minute expiry)
- Request Body:
  ```json
  {
    "state": "random_state_string",
    "code_verifier": "pkce_code_verifier"
  }
  ```

2. **Authorization URL Endpoint**
- Path: `GET /api/auth/square/url`
- Purpose: Generate Square authorization URL
- Query Parameters:
  - state
  - code_challenge
  - redirect_uri

3. **Token Exchange Endpoint**
- Path: `POST /api/auth/square/callback`
- Purpose: Exchange code for token
- Request Body:
  ```json
  {
    "code": "square_auth_code",
    "state": "original_state",
    "code_verifier": "original_code_verifier",
    "redirect_uri": "original_redirect_uri"
  }
  ```

### Important Implementation Notes

1. **App Initialization**
```typescript
// Must be called at app startup
WebBrowser.maybeCompleteAuthSession();
```

2. **No Additional Configuration Required**
- No deep linking setup
- No URL scheme configuration
- No extra app.json configuration

3. **Debugging Tips**
```typescript
// Add this to check redirect URL
console.log('Redirect URI:', SQUARE_CONFIG.redirectUri);
// Should show: https://auth.expo.io/@your-expo-username/your-app
```

### Flow Sequence

1. User initiates auth flow
2. Generate PKCE values and state
3. Register state with backend
4. Get authorization URL from backend
5. Launch AuthSession with Square URL
6. Square redirects through auth.expo.io proxy
7. AuthSession captures the response
8. Exchange code for token
9. Store JWT and update app state

### Key Differences from Regular OAuth

1. Using `useProxy: true` with AuthSession
2. No deep linking configuration needed
3. Relying on auth.expo.io for redirect handling
4. Simpler setup overall
5. Works out of the box with Expo Go

### Error Handling

```typescript
try {
  // ... authentication flow
} catch (error) {
  if (error.type === 'cancel') {
    // User cancelled the flow
    console.log('Authentication was cancelled');
  } else {
    // Handle other errors
    console.error('Authentication error:', error);
  }
}
```

### Security Considerations

1. Always use HTTPS for API endpoints
2. Store tokens securely using SecureStore
3. Validate state parameter to prevent CSRF
4. Use PKCE flow to prevent code interception
5. Clear tokens on logout 