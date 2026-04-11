const { getLocalityByName, getLocalityByVicNamesId } = require('../services/localityService');

const getLocality = async (req, res) => {
  try {
    const name = req.query.name || req.params.name;
    const { vicnamesid } = req.query;

    let result = null;

    if (name && name.trim()) {
      result = await getLocalityByName(name);
    } else if (vicnamesid) {
      result = await getLocalityByVicNamesId(vicnamesid);
    } else {
      return res.status(400).json({ message: 'name or vicnamesid is required' });
    }

    if (!result) {
      return res.status(404).json({ message: 'Locality not found' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Locality fetch error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch locality' });
  }
};

module.exports = {
  getLocality,
};