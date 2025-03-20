const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories');

/**
 * @route   GET /api/categories
 * @desc    Get all categories
 * @access  Public
 */
router.get('/', categoriesController.getCategories);

/**
 * @route   GET /api/categories/:id
 * @desc    Get category by ID
 * @access  Public
 */
router.get('/:id', categoriesController.getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Create a new category
 * @access  Private
 */
router.post('/', categoriesController.createCategory);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update a category
 * @access  Private
 */
router.put('/:id', categoriesController.updateCategory);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete a category
 * @access  Private
 */
router.delete('/:id', categoriesController.deleteCategory);

// Temporary route for testing
router.get('/test', (req, res) => {
  res.json({ message: 'Categories API is working' });
});

module.exports = router; 