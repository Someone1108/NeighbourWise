const { searchAddresses } = require('../services/searchService');

const searchAddress = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Query is required' });
    }

    const results = await searchAddresses(q);
    return res.json(results);
  } catch (error) {
    console.error('Address search error:', error.message);
    return res.status(500).json({ message: 'Failed to search addresses' });
  }
};

module.exports = {
  searchAddress
};