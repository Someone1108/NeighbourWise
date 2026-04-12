const express = require('express');
const router = express.Router();
const { getPoiInsights } = require('../controllers/insightController');

router.get('/poi', getPoiInsights);

module.exports = router;