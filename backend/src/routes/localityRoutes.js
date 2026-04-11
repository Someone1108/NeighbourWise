const express = require('express');
const { getLocality } = require('../controllers/localityController');
const { getLocalityByName } = require('../services/localityService');

const router = express.Router();

router.get('/', getLocality);

router.get('/:name/polygon', async (req, res) => {
  try {
    const result = await getLocalityByName(req.params.name);

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
    console.error('Locality polygon fetch error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch locality polygon' });
  }
});

module.exports = router;