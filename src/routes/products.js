const express = require('express');
const router = express.Router();

// Temporary route for testing
router.get('/', (req, res) => {
  res.json({ message: 'Products API is working' });
});

module.exports = router;
