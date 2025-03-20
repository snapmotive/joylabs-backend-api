# Square OAuth Implementation Guide

# Square OAuth Integration with PKCE for Expo App

This document provides a complete guide for integrating Square OAuth with PKCE in your Expo app. The implementation allows for secure authentication and authorization in a mobile environment.

## Required Packages

Install the required packages for handling OAuth authentication in Expo:

```bash
expo install expo-auth-session expo-crypto expo-web-browser @react-native-async-storage/async-storage
```

## Implementation Guide: PKCE OAuth Flow

### 1. Create a Square Auth Service

Create a file called `src/services/SquareAuthService.js` with the following content:

```javascript
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Auth storage keys
const STORAGE_KEY_AUTH = '@JoyLabs:SquareAuth';
const STORAGE_KEY_STATE = '@JoyLabs:SquareState';

// Your API base URL (from .env file)
const API_BASE_URL = 'http://your-api-domain.com'; // Replace with your API URL

class SquareAuthService {
  /**
   * Initialize the OAuth process
   * This method fetches the OAuth params from the backend
   */
  async initializeOAuth() {
    try {
      // Request OAuth params from the backend
      const response = await fetch(`${API_BASE_URL}/api/auth/square/mobile-init`);
      
      if (!response.ok) {
        throw new Error('Failed to initialize OAuth');
      }
      
      const data = await response.json();
      
      // Store the state parameter for validation later
      await AsyncStorage.setItem(STORAGE_KEY_STATE, data.state);
      
      return {
        authUrl: data.authUrl,
        state: data.state,
        codeVerifier: data.codeVerifier,
        codeChallenge: data.codeChallenge
      };
    } catch (error) {
      console.error('Error initializing OAuth:', error);
      throw error;
    }
  }
  
  /**
   * Start the OAuth flow using PKCE
   */
  async login() {
    try {
      // Initialize the OAuth process to get parameters
      const oauthParams = await this.initializeOAuth();
      
      // Start the auth request
      const result = await AuthSession.startAsync({
        authUrl: oauthParams.authUrl,
        returnUrl: AuthSession.makeRedirectUri({ path: 'oauth/callback' })
      });
      
      console.log('Auth result:', result);
      
      // Handle auth result
      if (result.type === 'success') {
        // Extract authorization code and state from URL
        const { url } = result;
        const params = AuthSession.parseRedirectUrl(url);
        
        // Validate state parameter
        const storedState = await AsyncStorage.getItem(STORAGE_KEY_STATE);
        if (params.state !== storedState) {
          throw new Error('State parameter mismatch - possible CSRF attack');
        }
        
        // Clean up state parameter
        await AsyncStorage.removeItem(STORAGE_KEY_STATE);
        
        // Exchange code for token
        return await this.exchangeCodeForToken(params.code, oauthParams.codeVerifier);
      } else if (result.type === 'cancel') {
        throw new Error('Authentication was cancelled');
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('OAuth Error:', error);
      throw error;
    }
  }
  
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, codeVerifier) {
    try {
      // Call your backend to exchange the code for tokens
      // The backend handles the client secret securely
      const response = await fetch(`${API_BASE_URL}/api/auth/square/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          mobile: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to exchange code for token');
      }
      
      const tokenData = await response.json();
      
      // Store the authentication data securely
      await this.storeAuthData(tokenData);
      
      return tokenData;
    } catch (error) {
      console.error('Token exchange error:', error);
      throw error;
    }
  }
  
  /**
   * Securely store authentication data
   */
  async storeAuthData(authData) {
    try {
      // Add timestamp for calculating token expiration
      authData.stored_at = Date.now();
      
      await AsyncStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(authData));
      return true;
    } catch (error) {
      console.error('Error storing auth data:', error);
      return false;
    }
  }
  
  /**
   * Get the stored authentication data
   */
  async getAuthData() {
    try {
      const authDataString = await AsyncStorage.getItem(STORAGE_KEY_AUTH);
      
      if (!authDataString) {
        return null;
      }
      
      const authData = JSON.parse(authDataString);
      
      // Check if token needs to be refreshed
      const expiresIn = authData.expires_in * 1000; // Convert to milliseconds
      const storedAt = authData.stored_at;
      const currentTime = Date.now();
      const tokenLifetime = currentTime - storedAt;
      
      // Refresh token if it will expire in less than 10 minutes
      if (tokenLifetime > (expiresIn - 10 * 60 * 1000)) {
        return await this.refreshToken(authData);
      }
      
      return authData;
    } catch (error) {
      console.error('Error getting auth data:', error);
      return null;
    }
  }
  
  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    const authData = await this.getAuthData();
    return !!authData && !!authData.access_token;
  }
  
  /**
   * Refresh the access token
   */
  async refreshToken(currentAuthData) {
    try {
      // Call your backend to refresh the token
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: currentAuthData.refresh_token
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const newAuthData = await response.json();
      
      // Store the updated auth data
      await this.storeAuthData(newAuthData);
      
      return newAuthData;
    } catch (error) {
      console.error('Token refresh error:', error);
      
      // If refresh fails, clear auth data and require re-login
      await this.logout();
      throw error;
    }
  }
  
  /**
   * Log out the user by clearing stored data and revoking token
   */
  async logout() {
    try {
      const authData = await this.getAuthData();
      
      if (authData && authData.access_token) {
        // Call your backend to revoke the token
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.access_token}`
          }
        });
      }
      
      // Clear local auth data regardless of revocation success
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      
      // Still clear local data even if revocation fails
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
      return false;
    }
  }
}

export default new SquareAuthService();
```

### 2. Create an Authentication Screen

Create a file called `src/screens/SquareAuthScreen.js` with the following content:

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, ActivityIndicator, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import SquareAuthService from '../services/SquareAuthService';

// Initialize WebBrowser
WebBrowser.maybeCompleteAuthSession();

export default function SquareAuthScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    // Check authentication status on load
    checkAuthStatus();
  }, []);
  
  const checkAuthStatus = async () => {
    try {
      const isAuth = await SquareAuthService.isAuthenticated();
      setIsAuthenticated(isAuth);
      
      if (isAuth) {
        // Get user profile after authentication
        const authData = await SquareAuthService.getAuthData();
        setUser({
          merchantId: authData.merchant_id,
          token: `${authData.access_token.substring(0, 10)}...`,
        });
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  };
  
  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await SquareAuthService.login();
      await checkAuthStatus();
    } catch (error) {
      setError(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleLogout = async () => {
    setIsLoading(true);
    
    try {
      await SquareAuthService.logout();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      setError(error.message || 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff9900" />
        <Text style={styles.loadingText}>Please wait...</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Square Authentication</Text>
      
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      
      {isAuthenticated ? (
        <View style={styles.profileContainer}>
          <Text style={styles.successText}>Authentication Successful!</Text>
          
          {user && (
            <View style={styles.userInfo}>
              <Text style={styles.userInfoText}>Merchant ID: {user.merchantId}</Text>
              <Text style={styles.userInfoText}>Token: {user.token}</Text>
            </View>
          )}
          
          <Button
            title="Logout"
            onPress={handleLogout}
            color="#ff5c5c"
          />
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <Button
            title="Connect with Square"
            onPress={handleLogin}
            color="#ff9900"
          />
          <Text style={styles.infoText}>
            Connect your Square account to manage your catalog, orders, and customers.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f7',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  buttonContainer: {
    width: '100%',
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 20,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#ffecec',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    color: '#f44336',
    textAlign: 'center',
  },
  profileContainer: {
    width: '100%',
    alignItems: 'center',
  },
  successText: {
    fontSize: 18,
    color: '#4CAF50',
    marginBottom: 20,
  },
  userInfo: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  userInfoText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
  },
});
```

### 3. Configure app.json for OAuth

Update your `app.json` file to include the required configuration for OAuth:

```json
{
  "expo": {
    "scheme": "joylabs",
    "ios": {
      "bundleIdentifier": "com.yourcompany.joylabs"
    },
    "android": {
      "package": "com.yourcompany.joylabs"
    }
  }
}
```

This ensures that your app can receive the redirect URL after OAuth completion.

### 4. Add the Backend OAuth Callback Handler

For this flow to work properly, your backend should update the callback handler to support both web and mobile clients:

```javascript
// In your backend controller
async function handleSquareCallback(req, res) {
  // If request is from mobile app, handle as JSON response
  const isMobileRequest = req.body && req.body.mobile === true;
  
  if (isMobileRequest) {
    try {
      const { code, code_verifier } = req.body;
      
      // Exchange code for token with code verifier
      const tokenResponse = await squareService.exchangeCodeForToken(code, code_verifier);
      
      // Return token data as JSON
      return res.json(tokenResponse);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  } else {
    // Handle web redirect flow (existing code)
    // ...
  }
}
```

## Security Best Practices

1. **Never store sensitive information in your app code** - The client_secret should never be included in your mobile application, as it can be extracted by decompiling the app. Always use the backend for token exchange.

2. **Use PKCE for mobile apps** - The implementation above uses PKCE (Proof Key for Code Exchange), which provides additional security for public clients like mobile apps.

3. **Securely store tokens** - Use AsyncStorage for Expo/React Native apps with proper encryption for production apps.

4. **Implement token refresh logic** - The above code includes logic to automatically refresh tokens before they expire.

5. **Validate state parameters** - Always validate state parameters to prevent CSRF attacks.

6. **Properly handle errors** - Ensure that the user is informed about errors and knows when they need to re-authenticate.

This implementation provides a secure way to integrate Square OAuth in your Expo application.
