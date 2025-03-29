# Catalog API Testing Guide

This guide explains how to test the JoyLabs Catalog API to ensure it's properly integrated with your application.

## Prerequisites

- Node.js installed on your machine
- A valid Square access token (with catalog permissions)
- Access to the JoyLabs backend repository

## Testing the Catalog API

We've created a test script that will verify all catalog API endpoints are functioning correctly. The script tests:

1. Base catalog endpoint
2. List catalog items
3. Search catalog items
4. Create a new catalog item
5. Retrieve a specific catalog item
6. Delete a catalog item

### Step 1: Ensure you have the necessary dependencies

```bash
npm install axios dotenv
```

### Step 2: Run the test script with your Square access token

```bash
node test-catalog-api.js YOUR_SQUARE_ACCESS_TOKEN
```

Replace `YOUR_SQUARE_ACCESS_TOKEN` with a valid Square access token that has catalog permissions.

### Expected Output

If everything is working correctly, you should see output with ✅ checkmarks for each successful test:

```
===========================================
Testing the JoyLabs Catalog API
===========================================
API Base URL: https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production
Using access token: EAAAa...AAAAA
===========================================

[TEST 1] Testing base catalog endpoint
✅ Base endpoint response:
...

[TEST 2] Testing catalog/list endpoint
✅ List endpoint response:
...

[TEST 3] Testing catalog/search endpoint
✅ Search endpoint response:
...
```

### Troubleshooting

If you see ❌ errors instead of ✅ checkmarks, here are some common issues:

1. **Invalid or expired access token**: Ensure your Square access token is valid and has the correct permissions
2. **Authentication errors (401)**: Verify that you're passing the token correctly
3. **Permission errors (403)**: The token lacks the necessary permissions for catalog operations
4. **Not found errors (404)**: Double-check the API URL is correct
5. **Server errors (500)**: Check CloudWatch logs for details

## Manual Testing

You can also test the API manually using curl or Postman:

### List catalog items:

```bash
curl -H "Authorization: Bearer YOUR_SQUARE_ACCESS_TOKEN" \
  https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/catalog/list
```

### Get a specific catalog item:

```bash
curl -H "Authorization: Bearer YOUR_SQUARE_ACCESS_TOKEN" \
  https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/catalog/item/ITEM_ID
```

### Search catalog:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SQUARE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"objectTypes": ["ITEM", "CATEGORY"], "limit": 10}' \
  https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/catalog/search
```

## Next Steps

Once you've confirmed the API is working correctly, you can integrate it with your frontend application. Refer to the detailed API documentation in `catalog-api-docs.md` for integration guidance, request/response formats, and example code. 