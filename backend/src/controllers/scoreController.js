const { getAccessibilityScore } = require('../services/accessibilityScoreService');
const { getSafetyScore } = require('../services/safetyScoreService');
const { getEnvironmentScore } = require('../services/environmentScoreService');
const { getLiveabilityScore } = require('../services/scoreService');
const {
  sendValidationError,
  validateScoreQuery,
} = require('../utils/validators');

const getAccessibility = async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getAccessibilityScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Accessibility Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate accessibility score'
    });
  }
};

const getSafety = async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getSafetyScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Safety Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate safety score'
    });
  }
};

const getEnvironment = async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getEnvironmentScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Environment Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate environment score'
    });
  }
};

const getLiveability = async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getLiveabilityScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Liveability Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate liveability score'
    });
  }
};

module.exports = {
  getAccessibility,
  getSafety,
  getEnvironment,
  getLiveability
};
