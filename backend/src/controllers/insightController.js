const { fetchPoiInsights } = require('../services/insightService');
const {
  sendValidationError,
  validateCoordinates,
  validateTravelTime,
} = require('../utils/validators');

const getPoiInsights = async (req, res) => {
  try {
    const { lat, lng } = validateCoordinates(req.query);
    const time = validateTravelTime(req.query.time);

    const data = await fetchPoiInsights({
      lat,
      lng,
      time
    });

    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Error fetching POI insights:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPoiInsights
};
