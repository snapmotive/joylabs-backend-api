# JoyLabs Catalog API Documentation

This document provides comprehensive instructions for interacting with the JoyLabs Catalog API, which is designed to manage Square catalog items, categories, modifiers, taxes, and more.

## Base URL

All catalog endpoints are available at:

```
https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/v2/catalog
```

## Authentication

All endpoints require authentication using a valid Square access token. Include the token in the `Authorization` header:

```
Authorization: Bearer YOUR_SQUARE_ACCESS_TOKEN
```

## Available Endpoints

### List Catalog Items

Retrieves a list of catalog items with optional filtering.

**Request:**
```
GET /v2/catalog/list
```

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)
- `types` (optional): Comma-separated list of object types to include (default: "ITEM,CATEGORY")

**Example Response:**
```json
{
  "success": true,
  "objects": [
    {
      "id": "XHSHLGPK5ZGLDPMXVPGZP4YV",
      "type": "CATEGORY",
      "categoryData": {
        "name": "Beverages"
      },
      "version": 1623362752368
    },
    {
      "id": "BPRLNTCKWVJYAHCVXF5E3RZ4",
      "type": "ITEM",
      "itemData": {
        "name": "Coffee",
        "description": "Fresh brewed coffee",
        "variations": [
          {
            "id": "URLAEMZAVLYTBCLE7JJLGPQN",
            "type": "ITEM_VARIATION",
            "itemVariationData": {
              "name": "Regular",
              "priceMoney": {
                "amount": 250,
                "currency": "USD"
              }
            }
          }
        ]
      },
      "version": 1623362857534
    }
  ],
  "cursor": "cursor-value-for-next-page",
  "count": 2
}
```

### Get Catalog Item

Retrieve a specific catalog item by ID.

**Request:**
```
GET /v2/catalog/item/{id}
```

**Path Parameters:**
- `id`: The ID of the catalog item to retrieve

**Example Response:**
```json
{
  "success": true,
  "catalogObject": {
    "id": "BPRLNTCKWVJYAHCVXF5E3RZ4",
    "type": "ITEM",
    "itemData": {
      "name": "Coffee",
      "description": "Fresh brewed coffee",
      "variations": [
        {
          "id": "URLAEMZAVLYTBCLE7JJLGPQN",
          "type": "ITEM_VARIATION",
          "itemVariationData": {
            "name": "Regular",
            "priceMoney": {
              "amount": 250,
              "currency": "USD"
            }
          }
        }
      ]
    },
    "version": 1623362857534
  },
  "relatedObjects": [
    {
      "id": "URLAEMZAVLYTBCLE7JJLGPQN",
      "type": "ITEM_VARIATION",
      "itemVariationData": {
        "name": "Regular",
        "priceMoney": {
          "amount": 250,
          "currency": "USD"
        }
      }
    }
  ]
}
```

### Create/Update Catalog Item

Create a new catalog item or update an existing one.

**Request:**
```
POST /v2/catalog/item
```

**Request Body:**
```json
{
  "type": "ITEM",
  "name": "Green Tea",
  "description": "Organic green tea",
  "categoryId": "XHSHLGPK5ZGLDPMXVPGZP4YV",
  "variations": [
    {
      "name": "Regular",
      "priceMoney": {
        "amount": 350,
        "currency": "USD"
      }
    }
  ],
  "idempotencyKey": "unique-idempotency-key-123"
}
```

**Example Response:**
```json
{
  "success": true,
  "catalogObject": {
    "id": "NEW_ITEM_ID",
    "type": "ITEM",
    "itemData": {
      "name": "Green Tea",
      "description": "Organic green tea",
      "categoryId": "XHSHLGPK5ZGLDPMXVPGZP4YV",
      "variations": [
        {
          "id": "NEW_VARIATION_ID",
          "type": "ITEM_VARIATION",
          "itemVariationData": {
            "name": "Regular",
            "priceMoney": {
              "amount": 350,
              "currency": "USD"
            }
          }
        }
      ]
    },
    "version": 1623364758923
  },
  "idempotencyKey": "unique-idempotency-key-123"
}
```

### Delete Catalog Item

Delete a specific catalog item by ID.

**Request:**
```
DELETE /v2/catalog/item/{id}
```

**Path Parameters:**
- `id`: The ID of the catalog item to delete

**Example Response:**
```json
{
  "success": true,
  "deletedObjectIds": ["ITEM_ID"]
}
```

### Search Catalog Items

Search for catalog items with advanced filtering.

**Request:**
```
POST /v2/catalog/search
```

**Request Body:**
```json
{
  "objectTypes": ["ITEM", "CATEGORY"],
  "query": {
    "exactQuery": {
      "attributeName": "name",
      "attributeValue": "Coffee"
    }
  },
  "limit": 10
}
```

**Example Response:**
```json
{
  "success": true,
  "objects": [
    {
      "id": "BPRLNTCKWVJYAHCVXF5E3RZ4",
      "type": "ITEM",
      "itemData": {
        "name": "Coffee",
        "description": "Fresh brewed coffee"
      }
    }
  ],
  "cursor": "cursor-value",
  "count": 1
}
```

### Batch Retrieve Catalog Objects

Retrieve multiple catalog objects in a single request.

**Request:**
```
POST /v2/catalog/batch-retrieve
```

**Request Body:**
```json
{
  "objectIds": [
    "BPRLNTCKWVJYAHCVXF5E3RZ4",
    "XHSHLGPK5ZGLDPMXVPGZP4YV"
  ],
  "includeRelatedObjects": true
}
```

**Example Response:**
```json
{
  "success": true,
  "objects": [
    {
      "id": "BPRLNTCKWVJYAHCVXF5E3RZ4",
      "type": "ITEM",
      "itemData": {
        "name": "Coffee",
        "description": "Fresh brewed coffee"
      }
    },
    {
      "id": "XHSHLGPK5ZGLDPMXVPGZP4YV",
      "type": "CATEGORY",
      "categoryData": {
        "name": "Beverages"
      }
    }
  ],
  "relatedObjects": []
}
```

### Batch Upsert Catalog Objects

Create or update multiple catalog objects in a single request.

**Request:**
```
POST /v2/catalog/batch-upsert
```

**Request Body:**
```json
{
  "idempotencyKey": "unique-batch-key-456",
  "batches": [
    {
      "objects": [
        {
          "type": "CATEGORY",
          "id": "#TeaCategory",
          "categoryData": {
            "name": "Tea"
          }
        },
        {
          "type": "ITEM",
          "id": "#GreenTea",
          "itemData": {
            "name": "Green Tea",
            "categoryId": "#TeaCategory",
            "variations": [
              {
                "type": "ITEM_VARIATION",
                "id": "#GreenTeaRegular",
                "itemVariationData": {
                  "name": "Regular",
                  "priceMoney": {
                    "amount": 350,
                    "currency": "USD"
                  }
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Example Response:**
```json
{
  "success": true,
  "idempotencyKey": "unique-batch-key-456",
  "objects": [
    {
      "id": "NEW_CATEGORY_ID",
      "type": "CATEGORY",
      "categoryData": {
        "name": "Tea"
      },
      "version": 1623366785312
    },
    {
      "id": "NEW_ITEM_ID",
      "type": "ITEM",
      "itemData": {
        "name": "Green Tea",
        "categoryId": "NEW_CATEGORY_ID",
        "variations": [
          {
            "id": "NEW_VARIATION_ID",
            "type": "ITEM_VARIATION",
            "itemVariationData": {
              "name": "Regular",
              "priceMoney": {
                "amount": 350,
                "currency": "USD"
              }
            }
          }
        ]
      },
      "version": 1623366785312
    }
  ]
}
```

### Batch Delete Catalog Objects

Delete multiple catalog objects in a single request.

**Request:**
```
POST /v2/catalog/batch-delete
```

**Request Body:**
```json
{
  "objectIds": [
    "BPRLNTCKWVJYAHCVXF5E3RZ4",
    "XHSHLGPK5ZGLDPMXVPGZP4YV"
  ]
}
```

**Example Response:**
```json
{
  "success": true,
  "deletedObjectIds": [
    "BPRLNTCKWVJYAHCVXF5E3RZ4",
    "XHSHLGPK5ZGLDPMXVPGZP4YV"
  ],
  "deletedAt": "2023-06-10T15:45:10Z"
}
```

### Update Item Modifier Lists

Update the modifier lists for a catalog item.

**Request:**
```
POST /v2/catalog/item/{id}/modifier-lists
```

**Path Parameters:**
- `id`: The ID of the catalog item to update

**Request Body:**
```json
{
  "modifierListsToAdd": [
    "ML_SWEETENER_OPTIONS",
    "ML_SIZE_OPTIONS"
  ],
  "modifierListsToRemove": [
    "ML_OLD_OPTIONS"
  ]
}
```

**Example Response:**
```json
{
  "success": true,
  "updatedAt": "2023-06-10T16:12:33Z"
}
```

### Update Item Taxes

Update the taxes for a catalog item.

**Request:**
```
POST /v2/catalog/item/{id}/taxes
```

**Path Parameters:**
- `id`: The ID of the catalog item to update

**Request Body:**
```json
{
  "taxesToAdd": [
    "TAX_SALES_TAX",
    "TAX_SPECIAL_BEVERAGE_TAX"
  ],
  "taxesToRemove": [
    "TAX_OLD_TAX"
  ]
}
```

**Example Response:**
```json
{
  "success": true,
  "updatedAt": "2023-06-10T16:15:45Z"
}
```

## Error Handling

All endpoints return a consistent error response format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error information"
}
```

Common HTTP status codes:
- 400: Bad Request - Invalid input parameters
- 401: Unauthorized - Invalid or missing access token
- 403: Forbidden - Insufficient permissions
- 404: Not Found - Resource not found
- 409: Conflict - Resource already exists
- 500: Internal Server Error - Server-side error

## Best Practices

1. **Use Idempotency Keys**: Always provide unique idempotency keys for non-idempotent operations like creating or updating items.
2. **Batch Operations**: Use batch operations when working with multiple objects to reduce API calls.
3. **Proper Error Handling**: Implement proper error handling in your application.
4. **Pagination**: Implement pagination when listing objects to avoid retrieving too many objects at once.
5. **Caching**: Consider caching responses for frequently accessed data that doesn't change often.

## Example Integration

Here's a complete example of fetching and displaying catalog items using React:

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CatalogItemsList = ({ accessToken }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCatalogItems = async () => {
      try {
        const response = await axios.get(
          'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/v2/catalog/list?types=ITEM',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        setItems(response.data.objects || []);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Failed to fetch catalog items');
        setLoading(false);
      }
    };

    fetchCatalogItems();
  }, [accessToken]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Catalog Items</h2>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            {item.itemData?.name || 'Unnamed Item'} 
            {item.itemData?.description && <p>{item.itemData.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CatalogItemsList;
```

## Support

For any questions or issues related to the Catalog API, please contact the JoyLabs development team at support@joylabs.com. 