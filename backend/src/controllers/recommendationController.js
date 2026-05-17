const {
  findInsightRecommendations,
  findCompareRecommendations
} = require('../services/recommendationService');
const {
  sendValidationError,
  validateCompareRecommendationBody,
  validateInsightRecommendationQuery,
} = require('../utils/validators');

/**
 * Insight Recommendation
 * GET /api/recommendations/insight
 */
async function getInsightRecommendations(req, res) {
  try {
    const input = validateInsightRecommendationQuery(req.query);

    const results =
      await findInsightRecommendations(input);

    res.json(results);

  } catch (error) {
    if (sendValidationError(res, error)) return;

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
    const input = validateCompareRecommendationBody(req.body);

    const results =
      await findCompareRecommendations(input);

    res.json(results);

  } catch (error) {
    if (sendValidationError(res, error)) return;

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
