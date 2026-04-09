const fs = require('fs');
const path = require('path');

function readGeoJson(filename) {
  const filePath = path.join(__dirname, '..', 'data', filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function getTestEppingLayers() {
  const boundary = readGeoJson('epping_boundary.geojson');
  const heat = readGeoJson('heat_epping.geojson');
  const vegetation = readGeoJson('vegetation_epping.geojson');

  return {
    suburb: 'Epping',
    boundary,
    heat,
    vegetation,
  };
}

module.exports = {
  getTestEppingLayers,
};