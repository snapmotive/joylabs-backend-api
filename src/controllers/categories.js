/**
 * Get all categories
 */
const getCategories = (req, res) => {
  res.json({ message: 'Get all categories - Coming soon' });
};

/**
 * Get category by ID
 */
const getCategoryById = (req, res) => {
  res.json({ message: `Get category ${req.params.id} - Coming soon` });
};

/**
 * Create a new category
 */
const createCategory = (req, res) => {
  res.json({ message: 'Create category - Coming soon' });
};

/**
 * Update a category
 */
const updateCategory = (req, res) => {
  res.json({ message: `Update category ${req.params.id} - Coming soon` });
};

/**
 * Delete a category
 */
const deleteCategory = (req, res) => {
  res.json({ message: `Delete category ${req.params.id} - Coming soon` });
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
}; 