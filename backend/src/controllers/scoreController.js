const { getAccessibilityScore } = require('../services/accessibilityScoreService');
const { getSafetyScore } = require('../services/safetyScoreService');
const { getEnvironmentScore } = require('../services/environmentScoreService');
const { getLiveabilityScore } = require('../services/scoreService');

// 統一處理 query
const normalizeScoreQuery = (query) => {
  const { lat, lng, time, persona } = query;

  const allowedTimes = [10, 20, 30];

  return {
    lat: Number(lat),
    lng: Number(lng),
    time: allowedTimes.includes(Number(time)) ? Number(time) : 20,
    persona: persona || 'default'
  };
};

//  Accessibility
const getAccessibility = async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getAccessibilityScore(params);
    res.json(result);
  } catch (err) {
    console.error('Accessibility Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate accessibility score',
      message: err.message
    });
  }
};

// Safety
const getSafety = async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getSafetyScore(params);
    res.json(result);
  } catch (err) {
    console.error('Safety Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate safety score',
      message: err.message
    });
  }
};

//  Environment
const getEnvironment = async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getEnvironmentScore(params);
    res.json(result);
  } catch (err) {
    console.error('Environment Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate environment score',
      message: err.message
    });
  }
};

// Liveability(final)
const getLiveability = async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getLiveabilityScore(params);
    res.json(result);
  } catch (err) {
    console.error('Liveability Controller error:', err);
    res.status(500).json({
      error: 'Failed to calculate liveability score',
      message: err.message
    });
  }
};

module.exports = {
  getAccessibility,
  getSafety,
  getEnvironment,
  getLiveability
};