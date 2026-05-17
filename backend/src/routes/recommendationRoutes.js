const express = require('express');
const router = express.Router();

const {
  getInsightRecommendations,
  getCompareRecommendations
} = require('../controllers/recommendationController');

router.get('/insight', getInsightRecommendations);
router.post('/compare', getCompareRecommendations);

module.exports = router;