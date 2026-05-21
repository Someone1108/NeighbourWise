const layerService = require('../services/layerService');
const {
  sendValidationError,
  validateLayerAddressQuery,
  validateSuburbName,
} = require('../utils/validators');

async function getLayersForSuburb(req, res) {
  try {
    const suburbName = validateSuburbName(req.params.name);
    const data = await layerService.getLayersForSuburb(suburbName, req.query.layer);
    res.json(data);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Error loading suburb layer data:', error);

    const statusCode =
      error.message && error.message.toLowerCase().includes('no boundary found')
        ? 404
        : 500;
    const errorMessage =
      statusCode === 404
        ? 'Suburb layer data was not found'
        : 'Failed to load suburb layer data';

    res.status(statusCode).json({
      error: errorMessage,
    });
  }
}

async function getLayersForAddress(req, res) {
  try {
    const { lat, lng, minutes, radiusMeters } = validateLayerAddressQuery(req.query);

    const data = await layerService.getLayersForAddress(
      lat,
      lng,
      radiusMeters,
      req.query.layer
    );

    res.json({
      ...data,
      minutes: Number(minutes) || 20,
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Error loading address layer data:', error);

    res.status(500).json({
      error: 'Failed to load address layer data',
    });
  }
}

module.exports = {
  getLayersForSuburb,
  getLayersForAddress,
};
