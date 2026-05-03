const aqiService = require('../services/aqiService');
const {
  sendValidationError,
  validateCoordinates,
} = require('../utils/validators');

async function getAqiForLocation(req, res) {
  try {
    const { lat, lng } = validateCoordinates(req.query);
    const data = await aqiService.getAqiForLocation({ lat, lng });

    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Error loading AQI data:', error);

    res.status(500).json({
      available: false,
      error: error.message || 'Failed to load AQI data',
    });
  }
}

module.exports = {
  getAqiForLocation,
};
