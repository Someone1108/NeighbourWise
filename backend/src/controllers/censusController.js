const {
  getCensusByLocation,
  getCensusByPostcode,
  getCensusBySa2,
  getCensusBySuburb,
} = require('../services/censusService');
const {
  sendValidationError,
  validateCoordinates,
  validatePostcode,
  validateSa2Code,
  validateSuburbName,
} = require('../utils/validators');

async function sendCensusResponse(res, work) {
  try {
    const result = await work();
    return res.json(result);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    console.error('Census API error:', error);
    return res.status(500).json({
      available: false,
      error: 'Failed to load Census profile',
      message: error.message,
    });
  }
}

function getSuburbProfile(req, res) {
  return sendCensusResponse(res, () =>
    getCensusBySuburb(validateSuburbName(req.params.name))
  );
}

function getPostcodeProfile(req, res) {
  return sendCensusResponse(res, () =>
    getCensusByPostcode(validatePostcode(req.params.postcode))
  );
}

function getSa2Profile(req, res) {
  return sendCensusResponse(res, () =>
    getCensusBySa2(validateSa2Code(req.params.code))
  );
}

function getLocationProfile(req, res) {
  return sendCensusResponse(res, () =>
    getCensusByLocation(validateCoordinates(req.query))
  );
}

module.exports = {
  getSuburbProfile,
  getPostcodeProfile,
  getSa2Profile,
  getLocationProfile,
};
