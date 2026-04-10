const fs = require('fs')
const path = require('path')
const turf = require('@turf/turf')

function readGeoJson(filename) {
  const filePath = path.join(__dirname, '..', 'data', filename)
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

const localityPolygons = readGeoJson('locality_polygon.geojson')
const heatFull = readGeoJson('heat_urban_2018.geojson')
const vegetationFull = readGeoJson('vegetation_2018.geojson')

const suburbLayerCache = new Map()

function normalizeName(name) {
  return String(name || '').trim().toLowerCase()
}

function getSuburbBoundaryByName(suburbName) {
  const target = normalizeName(suburbName)

  const features = (localityPolygons.features || []).filter((feature) => {
    const locality = feature?.properties?.LOCALITY
    return normalizeName(locality) === target
  })

  if (!features.length) {
    return null
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

function filterFeaturesToBoundary(sourceGeoJson, boundaryCollection) {
  if (
    !sourceGeoJson ||
    !Array.isArray(sourceGeoJson.features) ||
    !boundaryCollection ||
    !Array.isArray(boundaryCollection.features) ||
    boundaryCollection.features.length === 0
  ) {
    return { type: 'FeatureCollection', features: [] }
  }

  const matchedFeatures = []

  for (const feature of sourceGeoJson.features) {
    try {
      if (!feature?.geometry) continue

      let matches = false

      for (const boundaryFeature of boundaryCollection.features) {
        try {
          if (!boundaryFeature?.geometry) continue

          if (turf.booleanIntersects(feature, boundaryFeature)) {
            matches = true
            break
          }
        } catch {
          // skip bad boundary comparison
        }
      }

      if (matches) {
        matchedFeatures.push(feature)
      }
    } catch {
      // skip bad feature
    }
  }

  return {
    type: 'FeatureCollection',
    features: matchedFeatures,
  }
}

function getLayersForSuburb(suburbName) {
  const cacheKey = normalizeName(suburbName)

  if (suburbLayerCache.has(cacheKey)) {
    return suburbLayerCache.get(cacheKey)
  }

  const boundary = getSuburbBoundaryByName(suburbName)

  if (!boundary) {
    throw new Error(`No boundary found for suburb: ${suburbName}`)
  }

  const heat = filterFeaturesToBoundary(heatFull, boundary)
  const vegetation = filterFeaturesToBoundary(vegetationFull, boundary)

  console.log(suburbName, {
    boundary: boundary.features.length,
    heat: heat.features.length,
    vegetation: vegetation.features.length,
  })

  const result = {
    suburb: suburbName,
    boundary,
    heat,
    vegetation,
  }

  suburbLayerCache.set(cacheKey, result)
  return result
}

module.exports = {
  getLayersForSuburb,
}