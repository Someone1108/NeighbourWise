const { searchLocations } = require('../services/searchService');
const {
  sendValidationError,
  validateSearchQuery,
} = require('../utils/validators');

const searchAddress = async (req, res) => {
  try {
    const q = validateSearchQuery(req.query);
    const results = await searchLocations(q);
    return res.json(results);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Location search error:', error.message);
    return res.status(500).json({ message: 'Failed to search locations' });
  }
};

module.exports = {
  searchAddress,
};
