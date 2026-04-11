const layerService = require('../services/layerService');

async function getLayersForSuburb(req, res) {
  try {
    const suburbName = req.params.name;
    const data = await layerService.getLayersForSuburb(suburbName);
    res.json(data);
  } catch (error) {
    console.error('Error loading suburb layer data:', error);

    const statusCode =
      error.message && error.message.toLowerCase().includes('no boundary found')
        ? 404
        : 500;

    res.status(statusCode).json({
      error: error.message || 'Failed to load suburb layer data',
    });
  }
}

async function getLayersForAddress(req, res) {
  try {
    const { lat, lng, minutes, radiusMeters } = req.query;

    const data = await layerService.getLayersForAddress(
      lat,
      lng,
      radiusMeters
    );

    res.json({
      ...data,
      minutes: Number(minutes) || 20,
    });
  } catch (error) {
    console.error('Error loading address layer data:', error);

    res.status(500).json({
      error: error.message || 'Failed to load address layer data',
    });
  }
}

module.exports = {
  getLayersForSuburb,
  getLayersForAddress,
};