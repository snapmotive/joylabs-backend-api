const Joi = require('joi');

// Base product schema
const baseSchema = {
  name: Joi.string().max(100).trim(),
  description: Joi.string().max(500).allow('', null),
  price: Joi.number().min(0),
  category: Joi.string().allow(null),
  sku: Joi.string().trim().allow('', null),
  barcode: Joi.string().trim().allow('', null),
  stockQuantity: Joi.number().min(0).default(0),
  isActive: Joi.boolean().default(true),
  images: Joi.array().items(Joi.string()).default([]),
  lastScanned: Joi.date().allow(null).default(null)
};

// Schema for creating a new product
const createSchema = Joi.object({
  ...baseSchema,
  name: baseSchema.name.required(),
  price: baseSchema.price.required()
});

// Schema for updating a product
const updateSchema = Joi.object({
  ...baseSchema
});

module.exports = {
  create: createSchema,
  update: updateSchema
}; 