const {
  findInsightRecommendations,
  findCompareRecommendations
} = require('../services/recommendationService');

/**
 * Insight Recommendation
 * GET /api/recommendations/insight
 */
async function getInsightRecommendations(req, res) {
  try {
    const {
      lat,
      lng,
      suburb,
      postcode,
      address,
      profile,
      rangeMinutes
    } = req.query;

    const results =
      await findInsightRecommendations({
        lat,
        lng,
        suburb,
        postcode,
        address,
        profile,
        rangeMinutes
      });

    res.json(results);

  } catch (error) {
    console.error(
      'Insight recommendation error:',
      error
    );

    res.status(500).json({
      error:
        'Failed to get insight recommendations'
    });
  }
}

/**
 * Compare Recommendation
 * POST /api/recommendations/compare
 */
async function getCompareRecommendations(req, res) {
  try {
    // Compare recommendation uses req.body
    const input = req.body;

    const results =
      await findCompareRecommendations(input);

    res.json(results);

  } catch (error) {
    console.error(
      'Compare recommendation error:',
      error
    );

    res.status(500).json({
      error:
        'Failed to get compare recommendations'
    });
  }
}

module.exports = {
  getInsightRecommendations,
  getCompareRecommendations
};