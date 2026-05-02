const express = require('express');
const router = express.Router();

const { getAccessibilityScore } = require('../services/accessibilityScoreService');
const { getSafetyScore } = require('../services/safetyScoreService');
const { getEnvironmentScore } = require('../services/environmentScoreService');
const { getLiveabilityScore } = require('../services/scoreService');

function normalizeScoreQuery(query) {
  const { lat, lng, time, persona } = query;

  const allowedTimes = [10, 20, 30];

  return {
    lat: Number(lat),
    lng: Number(lng),
    time: allowedTimes.includes(Number(time)) ? Number(time) : 20,
    persona: persona || 'default'
  };
}

router.get('/accessibility', async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getAccessibilityScore(params);
    res.json(result);
  } catch (err) {
    console.error('Accessibility Score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate accessibility score',
      message: err.message
    });
  }
});

router.get('/safety', async (req, res) => {
  try {
    const params = normalizeScoreQuery(req.query);
    const result = await getSafetyScore(params);
    res.json(result);
  } catch (err) {
    console.error('Safety Score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate safety score',
      message: err.message
    });
  }
});


router.get('/environment', async (req, res) => {
  try {
    const { lat, lng, time, persona } = req.query;

    const result = await getEnvironmentScore({
      lat: Number(lat),
      lng: Number(lng),
      time: Number(time || 20),
      persona: persona || 'default'
    });

    res.json(result);
  } catch (err) {
    console.error('Environment score API error:', err);
    res.status(500).json({
      error: 'Failed to calculate environment score',
      message: err.message
    });
  }
});

router.get('/liveability', async (req, res) => {
  try {
    const { lat, lng, time, persona } = req.query;

    const result = await getLiveabilityScore({
      lat: Number(lat),
      lng: Number(lng),
      time: Number(time || 20),
      persona: persona || 'default'
    });

    res.json(result);
  } catch (err) {
    console.error('Liveability error:', err);
    res.status(500).json({
      error: 'Failed to calculate liveability score',
      message: err.message
    });
  }
});

module.exports = router;
