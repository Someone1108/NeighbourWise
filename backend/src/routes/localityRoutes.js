const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const geojsonPath = path.join(__dirname, '../data/locality_polygon.geojson');
const localityPolygons = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

router.get('/:name/polygon', (req, res) => {
  const suburbName = req.params.name.trim().toLowerCase();

  const matchedFeature = localityPolygons.features.find((feature) => {
    const locality = feature.properties.LOCALITY || '';
    return locality.toLowerCase() === suburbName;
  });

  if (!matchedFeature) {
    return res.status(404).json({ message: 'Suburb polygon not found' });
  }

  res.json({
    type: 'FeatureCollection',
    features: [matchedFeature],
  });
});

module.exports = router;