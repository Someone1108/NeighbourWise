const express = require('express');
const {
  getLocality,
  getCoverageSuburbs,
  getCoverageMap,
} = require('../controllers/localityController');
const { getLocalityByName } = require('../services/localityService');
const {
  sendValidationError,
  validateSuburbName,
} = require('../utils/validators');

const router = express.Router();

router.get('/', getLocality);
router.get('/coverage', getCoverageSuburbs);
router.get('/coverage-map', getCoverageMap);

router.get('/:name/polygon', async (req, res) => {
  try {
    const name = validateSuburbName(req.params.name);
    const result = await getLocalityByName(name);

    if (!result) {
      return res.status(404).json({ message: 'Locality not found' });
    }

    return res.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: result.id,
            locality: result.name,
            gazloc: result.displayName,
            vicnamesid: result.vicnamesid,
          },
          geometry: result.geometry,
        },
      ],
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Locality polygon fetch error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch locality polygon' });
  }
});

module.exports = router;
