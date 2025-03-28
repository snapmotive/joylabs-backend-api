/**
 * Request validation middleware
 * Validates request parameters, query, and body against defined schemas
 */

/**
 * Generate validation middleware from schema
 * @param {Object} schema - Validation schema with body, query, params objects
 * @returns {Function} Express middleware function
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const errors = {};
    
    // Function to validate a section of the request
    const validateSection = (section, data) => {
      const sectionErrors = {};
      
      if (!schema[section]) {
        return null; // No schema for this section
      }
      
      // Check each field in the schema
      Object.keys(schema[section]).forEach(field => {
        const fieldSchema = schema[section][field];
        const value = data[field];
        
        // Check if required field is missing
        if (fieldSchema.required && (value === undefined || value === null || value === '')) {
          sectionErrors[field] = `${field} is required`;
          return;
        }
        
        // Skip validation if field is not provided and not required
        if (value === undefined || value === null) {
          return;
        }
        
        // Validate field type
        if (fieldSchema.type) {
          const typeErrors = validateType(value, fieldSchema.type, field);
          if (typeErrors) {
            sectionErrors[field] = typeErrors;
            return;
          }
        }
        
        // Validate enum values
        if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
          sectionErrors[field] = `${field} must be one of: ${fieldSchema.enum.join(', ')}`;
          return;
        }
        
        // Validate min/max for numbers
        if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
          if (fieldSchema.min !== undefined && value < fieldSchema.min) {
            sectionErrors[field] = `${field} must be at least ${fieldSchema.min}`;
          }
          if (fieldSchema.max !== undefined && value > fieldSchema.max) {
            sectionErrors[field] = `${field} must be at most ${fieldSchema.max}`;
          }
        }
        
        // Validate string length
        if (fieldSchema.type === 'string') {
          if (fieldSchema.minLength !== undefined && value.length < fieldSchema.minLength) {
            sectionErrors[field] = `${field} must be at least ${fieldSchema.minLength} characters`;
          }
          if (fieldSchema.maxLength !== undefined && value.length > fieldSchema.maxLength) {
            sectionErrors[field] = `${field} must be at most ${fieldSchema.maxLength} characters`;
          }
        }
        
        // Validate array length
        if (fieldSchema.type === 'array') {
          if (fieldSchema.minItems !== undefined && value.length < fieldSchema.minItems) {
            sectionErrors[field] = `${field} must have at least ${fieldSchema.minItems} items`;
          }
          if (fieldSchema.maxItems !== undefined && value.length > fieldSchema.maxItems) {
            sectionErrors[field] = `${field} must have at most ${fieldSchema.maxItems} items`;
          }
        }
        
        // Validate regex pattern
        if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
          sectionErrors[field] = `${field} does not match required pattern`;
        }
        
        // Custom validation function
        if (fieldSchema.validate && typeof fieldSchema.validate === 'function') {
          const customError = fieldSchema.validate(value);
          if (customError) {
            sectionErrors[field] = customError;
          }
        }
      });
      
      return Object.keys(sectionErrors).length > 0 ? sectionErrors : null;
    };
    
    // Validate body if schema has body definition
    const bodyErrors = validateSection('body', req.body);
    if (bodyErrors) {
      errors.body = bodyErrors;
    }
    
    // Validate query parameters if schema has query definition
    const queryErrors = validateSection('query', req.query);
    if (queryErrors) {
      errors.query = queryErrors;
    }
    
    // Validate URL parameters if schema has params definition
    const paramsErrors = validateSection('params', req.params);
    if (paramsErrors) {
      errors.params = paramsErrors;
    }
    
    // If any errors, return 400 with error details
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    // All validations passed
    next();
  };
}

/**
 * Validate value against expected type
 * @param {any} value - Value to validate
 * @param {string} type - Expected type
 * @param {string} field - Field name for error message
 * @returns {string|null} Error message or null if valid
 */
function validateType(value, type, field) {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return `${field} must be a string`;
      }
      break;
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        // Try to convert string to number if possible
        if (typeof value === 'string' && !isNaN(Number(value))) {
          break; // Valid number string
        }
        return `${field} must be a number`;
      }
      break;
    case 'integer':
      if (!Number.isInteger(Number(value))) {
        return `${field} must be an integer`;
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return `${field} must be a boolean`;
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        // Try to parse JSON string array
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              break; // Valid array JSON string
            }
          } catch {
            // Invalid JSON string
          }
        }
        return `${field} must be an array`;
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        // Try to parse JSON string object
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              break; // Valid object JSON string
            }
          } catch {
            // Invalid JSON string
          }
        }
        return `${field} must be an object`;
      }
      break;
    default:
      return `Unknown type: ${type}`;
  }
  
  return null; // No error
}

module.exports = {
  validateRequest
}; 