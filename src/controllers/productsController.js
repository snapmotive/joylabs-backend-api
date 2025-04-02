const ProductService = require('../models/Product');
const { validate } = require('../utils/validator');
const productSchema = require('../utils/validation/productSchema');

/**
 * Product Controller
 */
const productsController = {
  /**
   * Get all products
   * @route GET /api/products
   */
  async getProducts(req, res, next) {
    try {
      const products = await ProductService.getAll();
      res.json({ success: true, count: products.length, data: products });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a product by ID
   * @route GET /api/products/:id
   */
  async getProductById(req, res, next) {
    try {
      const product = await ProductService.getById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found',
        });
      }

      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new product
   * @route POST /api/products
   */
  async createProduct(req, res, next) {
    try {
      // Validate request body
      const { error, value } = validate(req.body, productSchema.create);

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      // Check if product with same SKU already exists
      if (value.sku) {
        const existingProduct = await ProductService.getBySku(value.sku);
        if (existingProduct) {
          return res.status(400).json({
            success: false,
            error: 'Product with this SKU already exists',
          });
        }
      }

      // Check if product with same barcode already exists
      if (value.barcode) {
        const existingProduct = await ProductService.getByBarcode(value.barcode);
        if (existingProduct) {
          return res.status(400).json({
            success: false,
            error: 'Product with this barcode already exists',
          });
        }
      }

      const product = await ProductService.create(value);
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a product
   * @route PUT /api/products/:id
   */
  async updateProduct(req, res, next) {
    try {
      // Validate request body
      const { error, value } = validate(req.body, productSchema.update);

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      // Check if product exists
      const product = await ProductService.getById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found',
        });
      }

      // Check if SKU is being changed and already exists
      if (value.sku && value.sku !== product.sku) {
        const existingProduct = await ProductService.getBySku(value.sku);
        if (existingProduct && existingProduct.id !== req.params.id) {
          return res.status(400).json({
            success: false,
            error: 'Product with this SKU already exists',
          });
        }
      }

      // Check if barcode is being changed and already exists
      if (value.barcode && value.barcode !== product.barcode) {
        const existingProduct = await ProductService.getByBarcode(value.barcode);
        if (existingProduct && existingProduct.id !== req.params.id) {
          return res.status(400).json({
            success: false,
            error: 'Product with this barcode already exists',
          });
        }
      }

      const updatedProduct = await ProductService.update(req.params.id, value);
      res.json({ success: true, data: updatedProduct });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a product
   * @route DELETE /api/products/:id
   */
  async deleteProduct(req, res, next) {
    try {
      // Check if product exists
      const product = await ProductService.getById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found',
        });
      }

      await ProductService.delete(req.params.id);
      res.json({ success: true, data: {} });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = productsController;
