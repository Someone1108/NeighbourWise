const layerService = require('../services/layerService');

function getTestEppingLayers(req, res) {
  try {
    const data = layerService.getTestEppingLayers();
    res.json(data);
  } catch (error) {
    console.error('Error loading Epping layer data:', error);
    res.status(500).json({
      error: 'Failed to load Epping layer data',
    });
  }
}

module.exports = {
  getTestEppingLayers,
};