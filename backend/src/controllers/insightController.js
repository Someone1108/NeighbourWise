const { fetchPoiInsights } = require('../services/insightService');

const getPoiInsights = async (req, res) => {
  try {
    const { lat, lng, type, time } = req.query;

    if (!lat || !lng || !type) {
      return res.status(400).json({
        error: 'lat, lng, and type are required'
      });
    }

    const data = await fetchPoiInsights({
      lat: Number(lat),
      lng: Number(lng),
      type,
      time: Number(time)
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching POI insights:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPoiInsights
};