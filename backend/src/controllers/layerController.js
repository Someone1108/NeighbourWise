const layerService = require('../services/layerService')

function getLayersForSuburb(req, res) {
  try {
    const suburbName = req.params.name
    const data = layerService.getLayersForSuburb(suburbName)
    res.json(data)
  } catch (error) {
    console.error('Error loading suburb layer data:', error)
    res.status(404).json({
      error: error.message || 'Failed to load suburb layer data',
    })
  }
}

module.exports = {
  getLayersForSuburb,
}