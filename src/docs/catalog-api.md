# Square Catalog API Integration

This document describes how the JoyLabs backend implements the Square Catalog API, with a specific focus on retrieving categories.

## Searching for Categories

There are two ways to retrieve categories from the backend:

### 1. Simple Categories Endpoint (Recommended)

The simplest way to get all categories:

```http
GET /v2/catalog/categories
```

This endpoint supports the following query parameters:
- `limit`: Maximum number of categories to return (default: 100)
- `cursor`: Pagination cursor from a previous response
- `include_related_objects`: Set to "true" to include related objects

Example:
```
GET /v2/catalog/categories?limit=50&include_related_objects=true
```

### 2. Square-Compatible Search Endpoint

For more advanced search capabilities, use the search endpoint:

```http
POST /v2/catalog/search
```

Request body for retrieving categories:

```json
{
  "object_types": ["CATEGORY"],
  "limit": 100,
  "include_related_objects": false
}
```

For filtering categories by name, you can use:

```json
{
  "object_types": ["CATEGORY"],
  "query": {
    "prefix_query": {
      "attribute_name": "name",
      "attribute_prefix": "Foo"
    }
  }
}
```

## Complete Example

Here's a complete example of how to search for categories using the Square-compatible search endpoint:

```javascript
// Example using fetch API
const searchCategories = async () => {
  const response = await fetch('/v2/catalog/search', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      "object_types": ["CATEGORY"],
      "limit": 100
    })
  });
  
  const result = await response.json();
  
  if (result.success && result.objects) {
    // Process categories
    const categories = result.objects;
    console.log('Categories:', categories);
  }
};
```

## Response Format

The response will follow this format:

```json
{
  "success": true,
  "objects": [
    {
      "type": "CATEGORY",
      "id": "CATEGORY_ID",
      "updated_at": "2023-01-01T00:00:00Z",
      "version": 1234567890,
      "is_deleted": false,
      "present_at_all_locations": true,
      "category_data": {
        "name": "Category Name"
      }
    }
  ],
  "cursor": "PAGINATION_CURSOR",
  "related_objects": []
}
```

## Error Responses

If there's an error, the response will follow this format:

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information"
}
``` 