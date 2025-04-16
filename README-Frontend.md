# JoyLabs Frontend Development Guide

This guide provides instructions and rules for developing the JoyLabs frontend application, focusing on integration with the JoyLabs backend API (v3).

## Table of Contents

- [Backend Integration Rules](#backend-integration-rules)
- [API Architecture & Catalog Operations](#api-architecture--catalog-operations)
- [Authentication Flow](#authentication-flow)
- [Data Management](#data-management)
- [Square Integration Details](#square-integration-details)
- [Development Notes](#development-notes)
- [App Navigation Guide](#joylabs-app-navigation-guide)
- [Square Case Usage (camelCase vs snake_case)](#squares-usage-of-camelcase-vs-snake_case)
- [Expo Router Layout Rules](#expo-router-layout-rules)

## Backend Integration Rules

- **Do NOT modify backend code directly.** If backend changes are necessary, provide detailed prompts and requirements to the backend team.
- **ALWAYS use PRODUCTION mode.** No sandbox, test, or dev modes are configured in the backend. All interactions are with live Square data.
- **Remove all placeholders** in API calls and configurations.
- **Square Redirect URL MUST be HTTPS:** `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback` (Used during OAuth flow).
- **Use deeplinking** for Expo development callbacks (e.g., `joylabs://square-callback`). NO custom web URLs like `joylabs.com` for callbacks.
- **Be thorough!** Check all dependencies and potential impacts of your changes before declaring a fix or feature complete.

## API Architecture & Catalog Operations

- **Base URL:** `https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production`
- **Backend Role Distinction:**

  - **OAuth & User Management:** Handled by dedicated backend Lambda functions (`oauth`, `api`). These involve specific logic for token exchange, state management, and potentially user data.
  - **Catalog Operations:** Handled by the `catalog` Lambda function, acting purely as an **authenticated proxy** directly to the Square API.

- **Endpoint Groups:**

  1.  **OAuth & Core Backend Endpoints (Use `/api/*` prefix):**

      - `GET /api/auth/connect/url`: Initiates the OAuth flow (no token required initially).
      - `GET /api/auth/square/callback`: Handles the redirect from Square after user authorization.
      - `POST /api/auth/validate-token`: Checks the validity of an existing token (Requires Bearer token).
      - `GET /api/health`: Basic health check.
      - _(Potentially others for user management, etc.)_
      - **Interaction:** Frontend calls these endpoints; backend Lambdas execute specific logic (token exchange, state validation, etc.).

  2.  **Catalog Operations (Proxied - Use `/v2/catalog/*` prefix):**
      - `GET /v2/catalog/list`: List items, categories, etc. (Requires Bearer token).
      - `GET /v2/catalog/item/{object_id}`: Retrieve a specific object (Requires Bearer token).
      - `POST /v2/catalog/search`: Search catalog objects (Requires Bearer token).
      - `POST /v2/catalog/object`: Create/Update catalog objects (Requires Bearer token).
      - `GET /v2/catalog/list-categories`: Convenience endpoint for categories (Requires Bearer token).
      - **Interaction:** Frontend calls these endpoints with a valid `Authorization: Bearer <token>`. The backend `catalog` Lambda _validates the token_ and then directly forwards the request (headers, body, query params) to the corresponding Square API endpoint. The response from Square is directly proxied back to the frontend.

- **Data Structure (Catalog):** Responses from `/v2/catalog/*` endpoints directly reflect the Square API's JSON structure (using `snake_case`). Refer to the [Square Catalog API Documentation](https://developer.squareup.com/reference/square/catalog-api).
- **API Client:** Use `apiClient` or `axios` accordingly, ensuring correct URLs and required `Authorization` headers for authenticated calls.

## Authentication Flow

- **Protocol:** OAuth 2.0 with Square using PKCE.
- **Initiation:** Start the flow by calling `GET /api/auth/connect/url` on our backend to get the Square authorization URL.
- **Callback:** After the user authorizes on Square, they are redirected via deep link (`joylabs://square-callback`), which should trigger the frontend to handle the callback and potentially exchange the authorization code via our backend (handled internally by the callback endpoint logic if needed, or passed to `GET /api/auth/square/callback`).
- **Token Management:**
  - Successful authentication via the backend flow results in access and refresh tokens.
  - Store tokens securely using Expo's `SecureStore`.
  - `TokenService` (or similar) manages token storage, retrieval, and validation (e.g., using `POST /api/auth/validate-token`).
- **Authenticated Requests:** Use the obtained access token as a Bearer token in the `Authorization` header for all subsequent calls requiring authentication, primarily the `/v2/catalog/*` endpoints.

## Data Management

- **Sorting:** Categories fetched via `/v2/catalog/list-categories` or `/v2/catalog/list?types=CATEGORY` should be sorted alphabetically client-side if needed.
- **Selective Fetching:** Use appropriate API calls for specific data needs (e.g., fetch only categories vs. full item list). Consider using `refreshData('categories')` patterns if applicable.
- **Error Handling:** Implement robust error handling for API calls, providing clear UI feedback to the user on failures. Parse error responses forwarded from Square via the backend proxy.
- **Caching:** Implement TTL-based caching using memory cache or other strategies to reduce redundant API calls and improve performance.

## Square Integration Details

- **Square App ID:** `sq0idp-WFTYv3An7NPv6ovGFLld1Q`
- **Square API Version (Handled by Backend):** The backend proxy ensures the correct `Square-Version` header (`2025-03-19`) is used for all proxied requests.
- **Search Endpoint Usage:** `POST /v2/catalog/search` requires a valid Square Catalog Search query body. Ensure `object_types` are included when necessary as per Square documentation.

## Development Notes

- **Development Server Port:** Always launch the Expo development server on Port **8081**. If the port is occupied, shut down the existing server (`Ctrl+C` in the terminal) and restart it. Do not attempt to use the next available port (e.g., 8082) as backend configurations might rely on port 8081.

## JoyLabs App Navigation Guide

### Main App Flow

The application uses a bottom tab bar for primary navigation upon launch.

### Path to Sync Functionality

1. App Launch → Bottom Tab Bar
2. Tap **"Profile"** Tab (Rightmost Icon)
3. Profile Screen → Top Tab Navigation
4. Tap **"Sync"** Tab

### Key Pages & Files Reference

#### Profile Screen & Tabs

- **File:** `app/profile.tsx`
- **Contains Top Tabs:** "profile", "settings", "categories", "sync"

#### Sync Tab Content

- **Location:** Within the "Sync" tab on the Profile screen.
- **Components:**
  - `CatalogSyncStatus` (`src/components/CatalogSyncStatus.tsx`)
  - `SyncLogsView` (`src/components/SyncLogsView.tsx`)

#### CatalogSyncStatus Component

- **Purpose:** Displays sync status (last sync, progress).
- **Actions:**
  - "Full Sync" button
  - "Categories Only" button
  - Debug Mode (Bug Icon):
    - "Test API" button
    - "Reset Sync" button

#### SyncLogsView Component

- **Purpose:** Shows sync operation logs.
- **Actions:**
  - Refresh button
  - Download button
  - Trash button

### Catalog Categories Browsing

1. App Launch → Bottom Tab Bar
2. Tap **"Profile"** Tab
3. Profile Screen → Top Tab Navigation
4. Tap **"Categories"** Tab

### Settings Access

1. App Launch → Bottom Tab Bar
2. Tap **"Profile"** Tab
3. Profile Screen → Top Tab Navigation
4. Tap **"Settings"** Tab

### Core Code References

- **Sync Logic:** `src/database/catalogSync.ts` (May need refactoring if sync logic changes due to backend proxy)
- **API Communication:** `src/api/index.ts` (Verify usage of proxied endpoints)
- **Database Operations:** `src/database/db.ts`
- **Square Auth:** `src/hooks/useSquareAuth.ts`

_Always reference the relevant file path when discussing UI elements or behavior._

## Square's usage of camelCase vs snake_case

The Square API uses **`snake_case`** for JSON keys in API responses and webhook payloads.

- **API Responses (via Backend Proxy `/v2/catalog/*`):** Expect **`snake_case`** (e.g., `payment_status`, `item_data`). The backend proxy forwards Square's response directly.
- **API Responses (from `/api/*` endpoints):** These _might_ use `camelCase` if the backend logic transforms data, but generally aim for consistency. Check specific endpoint responses.
- **Frontend:** Adapt frontend models and interfaces primarily for `snake_case` when dealing with catalog data. Be mindful of potential differences if interacting with non-proxied `/api/*` endpoints.

**Example (Catalog Proxy):**

- Response from `GET /v2/catalog/list`: `{"objects": [{"id": "...", "type": "ITEM", "item_data": {...}}], "cursor": "..."}`

## Expo Router Layout Rules

- **Main Navigation:** Define primary navigation elements (Bottom Tabs, Drawers) in parent **layout files** (e.g., `app/_layout.tsx`, `app/(tabs)/_layout.tsx`).
- **Screen Components:** Individual screen files (e.g., `app/profile.tsx`) rendered within layouts should **NOT** render these main navigation elements themselves.
- **Scrolling:** If a screen's content needs to be scrollable, wrap the _screen-specific content_ in a `<ScrollView>` within the screen component file (e.g., `app/profile.tsx`). Layout files manage headers/footers around this scrollable view.
- **Modifying Navigation:** To change tabs, headers, etc., first check the relevant **layout file (`_layout.tsx`)** where the navigator (`Tabs`, `Stack`, etc.) is configured.
