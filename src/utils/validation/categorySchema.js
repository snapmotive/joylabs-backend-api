const Joi = require('joi');

// Base category schema
const baseSchema = {
  name: Joi.string().max(50).trim(),
  description: Joi.string().max(200).allow('', null),
  color: Joi.string().default('#3498db'),
  icon: Joi.string().allow('', null),
  isActive: Joi.boolean().default(true),
  parentCategory: Joi.string().allow(null).default(null)
};

// Schema for creating a new category
const createSchema = Joi.object({
  ...baseSchema,
  name: baseSchema.name.required()
});

// Schema for updating a category
const updateSchema = Joi.object({
  ...baseSchema
});

module.exports = {
  create: createSchema,
  update: updateSchema
}; 