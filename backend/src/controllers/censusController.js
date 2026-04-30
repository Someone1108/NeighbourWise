const {
  getCensusByLocation,
  getCensusByPostcode,
  getCensusBySa2,
  getCensusBySuburb,
} = require('../services/censusService');

async function sendCensusResponse(res, work) {
  try {
    const result = await work();
    return res.json(result);
  } catch (error) {
    console.error('Census API error:', error);
    return res.status(500).json({
      available: false,
      error: 'Failed to load Census profile',
      message: error.message,
    });
  }
}

function getSuburbProfile(req, res) {
  return sendCensusResponse(res, () => getCensusBySuburb(req.params.name));
}

function getPostcodeProfile(req, res) {
  return sendCensusResponse(res, () => getCensusByPostcode(req.params.postcode));
}

function getSa2Profile(req, res) {
  return sendCensusResponse(res, () => getCensusBySa2(req.params.code));
}

function getLocationProfile(req, res) {
  return sendCensusResponse(res, () =>
    getCensusByLocation({
      lat: req.query.lat,
      lng: req.query.lng,
    })
  );
}

module.exports = {
  getSuburbProfile,
  getPostcodeProfile,
  getSa2Profile,
  getLocationProfile,
};
