# JoyLabs Catalog Lambda

This Lambda function handles all catalog-related API requests for the JoyLabs backend. It integrates with Square's Catalog API to allow for management of catalog items, categories, and other catalog objects.

## Deployment

To deploy the catalog Lambda function:

```bash
./deploy-catalog.sh
```

This script will deploy only the catalog Lambda function without affecting the main API.

## File Structure

- `src/catalogHandlers.js`: The main Lambda handler for catalog requests
- `src/routes/catalog.js`: Contains all the catalog API routes
- `src/services/catalog.js`: Service layer for interacting with Square's Catalog API
- `src/models/CatalogItem.js`: Data model for catalog items
- `catalog-api-docs.md`: Comprehensive documentation for the frontend team

## Documentation

Refer to `catalog-api-docs.md` for detailed API documentation, including:

- Available endpoints
- Request/response formats
- Authentication
- Error handling
- Example integrations

## Endpoints

All catalog endpoints are available at:

```
https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/catalog
```

The following endpoints are supported:

- `GET /list`: List catalog items
- `GET /item/:id`: Get a specific catalog item
- `POST /item`: Create or update a catalog item
- `DELETE /item/:id`: Delete a catalog item
- `POST /search`: Search catalog items
- `POST /batch-retrieve`: Batch retrieve catalog objects
- `POST /batch-upsert`: Batch create/update catalog objects
- `POST /batch-delete`: Batch delete catalog objects
- `POST /item/:id/modifier-lists`: Update modifier lists for an item
- `POST /item/:id/taxes`: Update taxes for an item

## Authentication

All endpoints require authentication with a Square access token in the Authorization header:

```
Authorization: Bearer <square_access_token>
```

## Permissions

The catalog Lambda requires the following permissions:

- DynamoDB access for catalog item storage
- Secrets Manager access for Square credentials
- CloudWatch for logging 