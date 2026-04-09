const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const geojsonPath = path.join(__dirname, '../data/locality_point.geojson');
const localityPoints = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
const { searchAddress } = require('../controllers/searchController');



router.get('/localities', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();

  if (!q) {
    return res.json([]);
  }

  const results = localityPoints.features
    .filter((feature) => {
      const placeName = feature.properties.PLACE_NAME || '';
      const placeLabel = feature.properties.PLACELABEL || '';
      return (
        placeName.toLowerCase().includes(q) ||
        placeLabel.toLowerCase().includes(q)
      );
    })
    .map((feature) => ({
      id: feature.properties.UFI || feature.properties.PFI,
      name: feature.properties.PLACELABEL || feature.properties.PLACE_NAME,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      state: feature.properties.STATE,
      featureSubtype: feature.properties.FEATSUBTYP,
    }));

  res.json(results);
});

router.get('/address', searchAddress);

module.exports = router;