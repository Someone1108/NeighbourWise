const { searchLocations } = require('../services/searchService');

const searchAddress = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Query is required' });
    }

    const results = await searchLocations(q.trim());
    return res.json(results);
  } catch (error) {
    console.error('Location search error:', error.message);
    return res.status(500).json({ message: 'Failed to search locations' });
  }
};

module.exports = {
  searchAddress,
};