const express = require('express');
const router = express.Router();

const { getAccessibilityScore } = require('../services/accessibilityScoreService');
const { getSafetyScore } = require('../services/safetyScoreService');
const { getEnvironmentScore } = require('../services/environmentScoreService');
const { getLiveabilityScore } = require('../services/scoreService');
const {
  sendValidationError,
  validateScoreQuery,
} = require('../utils/validators');

router.get('/accessibility', async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getAccessibilityScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Accessibility Score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate accessibility score',
      message: err.message
    });
  }
});

router.get('/safety', async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getSafetyScore(params);
    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Safety Score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate safety score',
      message: err.message
    });
  }
});


router.get('/environment', async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getEnvironmentScore(params);

    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Environment score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate environment score',
      message: err.message
    });
  }
});

router.get('/liveability', async (req, res) => {
  try {
    const params = validateScoreQuery(req.query);
    const result = await getLiveabilityScore(params);

    res.json(result);
  } catch (err) {
    if (sendValidationError(res, err)) return;

    console.error('Liveability error:', err);
    res.status(500).json({
      error: 'Failed to calculate liveability score',
      message: err.message
    });
  }
});

module.exports = router;
