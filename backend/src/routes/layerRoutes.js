const express = require('express');
const router = express.Router();

const layerController = require('../controllers/layerController');

router.get('/test/epping', layerController.getTestEppingLayers);

module.exports = router;