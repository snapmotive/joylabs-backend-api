const Joi = require('joi');

/**
 * Validates an object against a Joi schema
 * 
 * @param {Object} data - Data to validate
 * @param {Object} schema - Joi schema to validate against
 * @returns {Object} Object with error and value properties
 */
const validate = (data, schema) => {
  return schema.validate(data, { 
    abortEarly: false,   // Return all errors, not just the first one
    stripUnknown: true,  // Remove unknown properties
    errors: {
      wrap: {
        label: false     // Don't wrap error labels in quotes
      }
    }
  });
};

module.exports = {
  validate
}; 