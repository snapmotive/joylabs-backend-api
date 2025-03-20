# Square OAuth Implementation Guide

# Square OAuth Integration with PKCE for Expo App

This document provides a reference implementation for securely integrating your Expo app with Square OAuth using PKCE (Proof Key for Code Exchange).

## Required Packages

First, install the necessary packages:

```bash
expo install expo-auth-session expo-crypto expo-web-browser @react-native-async-storage/async-storage
```

## OAuth Implementation with PKCE

Create a `SquareAuthService.js` file in your project:

```javascript
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Register your scheme in app.json
// "scheme": "joylabs"

// Your backend API URL
const API_URL = 'https://012dp4dzhb.execute-api.us-west-1.amazonaws.com/dev';

// Storage keys
const AUTH_TOKEN_KEY = 'joylabs.auth.token';
const AUTH_EXPIRY_KEY = 'joylabs.auth.expiry';
const MERCHANT_INFO_KEY = 'joylabs.merchant.info';

export default class SquareAuthService {
  static async login() {
    try {
      // Generate code verifier (random string for PKCE)
      const codeVerifier = AuthSession.generateCodeVerifier();

      // Create code challenge from verifier
      const codeChallenge = await AuthSession.generateCodeChallenge(codeVerifier);
      const state = Crypto.randomUUID();

      // Store for later verification (WebBrowser will close your app)
      await AsyncStorage.setItem('square_auth_state', state);
      await AsyncStorage.setItem('square_code_verifier', codeVerifier);

      // Redirect to backend which handles Square OAuth
      const authUrl = `${API_URL}/api/auth/square?pkce=true&state=${state}`;
      
      // Open browser for authentication
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'joylabs://auth/callback'
      );

      // Handle result
      if (result.type === 'success') {
        const url = result.url;
        // Parse URL for token
        const params = new URLSearchParams(url.split('?')[1]);
        const token = params.get('token');

        if (token) {
          await this.saveToken(token);
          return { success: true, token };
        }
      }
      
      return { success: false, error: 'Authentication cancelled or failed' };
    } catch (error) {
      console.error('Square auth error:', error);
      return { success: false, error: error.message };
    }
  }

  static async saveToken(token) {
    try {
      // Decode token to get expiry (assumes JWT)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      
      // Save authentication data
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      await AsyncStorage.setItem(AUTH_EXPIRY_KEY, String(payload.exp * 1000));
      
      return true;
    } catch (error) {
      console.error('Error saving auth token:', error);
      return false;
    }
  }

  static async getToken() {
    try {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const expiry = await AsyncStorage.getItem(AUTH_EXPIRY_KEY);
      
      // Check if token is expired
      if (token && expiry) {
        const expiryDate = Number(expiry);
        if (expiryDate > Date.now()) {
          return token;
        } else {
          // Token is expired, clear it
          await this.logout();
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  static async logout() {
    try {
      const token = await this.getToken();
      if (token) {
        // Call your backend to revoke the token
        const userId = this.getUserIdFromToken(token);
        if (userId) {
          await fetch(`${API_URL}/api/auth/logout/${userId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
        }
      }
      
      // Clear local storage
      await AsyncStorage.multiRemove([
        AUTH_TOKEN_KEY, 
        AUTH_EXPIRY_KEY,
        MERCHANT_INFO_KEY
      ]);
      
      return true;
    } catch (error) {
      console.error('Error during logout:', error);
      return false;
    }
  }

  static getUserIdFromToken(token) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      return payload.id;
    } catch (error) {
      console.error('Error parsing token:', error);
      return null;
    }
  }

  static async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }
}
```

## Usage in Your App

```javascript
import React, { useState, useEffect } from 'react';
import { View, Button, Text, ActivityIndicator } from 'react-native';
import SquareAuthService from './SquareAuthService';

export default function SquareAuthScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    const status = await SquareAuthService.isAuthenticated();
    setIsAuthenticated(status);
  }

  async function handleLogin() {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await SquareAuthService.login();
      if (result.success) {
        setIsAuthenticated(true);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    try {
      await SquareAuthService.logout();
      setIsAuthenticated(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#4CAF50" />
      ) : isAuthenticated ? (
        <>
          <Text>You are connected to Square!</Text>
          <Button title="Disconnect from Square" onPress={handleLogout} />
        </>
      ) : (
        <>
          <Text>Connect your Square account to get started</Text>
          <Button title="Connect with Square" onPress={handleLogin} />
        </>
      )}
      
      {error && <Text style={{ color: 'red', marginTop: 20 }}>{error}</Text>}
    </View>
  );
}
```

## Configuration in app.json

```json
{
  "expo": {
    "scheme": "joylabs",
    "ios": {
      "bundleIdentifier": "com.yourcompany.joylabs"
    },
    "android": {
      "package": "com.yourcompany.joylabs"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

## Security Best Practices

1. **Never store sensitive data** like API keys directly in your app code
2. **Always use PKCE** for OAuth flows in mobile apps
3. **Store tokens securely** using AsyncStorage (or better, expo-secure-store)
4. **Use HTTPS** for all API calls
5. **Implement token refresh** logic to maintain sessions
6. **Validate all responses** from your backend
7. **Handle authentication errors** gracefully

By implementing this flow, your Expo app will securely authenticate with Square while following OAuth security best practices for mobile applications.
