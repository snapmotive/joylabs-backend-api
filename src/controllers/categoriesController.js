const CategoryService = require('../models/Category');
const { validate } = require('../utils/validator');
const categorySchema = require('../utils/validation/categorySchema');

/**
 * Category Controller
 */
const categoriesController = {
  /**
   * Get all categories
   * @route GET /api/categories
   */
  async getCategories(req, res, next) {
    try {
      const categories = await CategoryService.getAll();
      res.json({ success: true, count: categories.length, data: categories });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a category by ID
   * @route GET /api/categories/:id
   */
  async getCategoryById(req, res, next) {
    try {
      const category = await CategoryService.getById(req.params.id);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found',
        });
      }

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a new category
   * @route POST /api/categories
   */
  async createCategory(req, res, next) {
    try {
      // Validate request body
      const { error, value } = validate(req.body, categorySchema.create);

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      try {
        const category = await CategoryService.create(value);
        res.status(201).json({ success: true, data: category });
      } catch (error) {
        if (error.message === 'Category with this name already exists') {
          return res.status(400).json({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a category
   * @route PUT /api/categories/:id
   */
  async updateCategory(req, res, next) {
    try {
      // Validate request body
      const { error, value } = validate(req.body, categorySchema.update);

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }

      // Check if category exists
      const category = await CategoryService.getById(req.params.id);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found',
        });
      }

      // Check if name is being changed and already exists
      if (value.name && value.name !== category.name) {
        const existingCategory = await CategoryService.getByName(value.name);
        if (existingCategory && existingCategory.id !== req.params.id) {
          return res.status(400).json({
            success: false,
            error: 'Category with this name already exists',
          });
        }
      }

      const updatedCategory = await CategoryService.update(req.params.id, value);
      res.json({ success: true, data: updatedCategory });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a category
   * @route DELETE /api/categories/:id
   */
  async deleteCategory(req, res, next) {
    try {
      // Check if category exists
      const category = await CategoryService.getById(req.params.id);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found',
        });
      }

      await CategoryService.delete(req.params.id);
      res.json({ success: true, data: {} });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = categoriesController;
