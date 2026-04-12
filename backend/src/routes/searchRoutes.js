const express = require('express');
const { searchAddress } = require('../controllers/searchController');

const router = express.Router();

/**
 * Unified search endpoint:
 * returns suburb/locality results from Supabase
 * plus address results from Mapbox
 */
router.get('/address', searchAddress);

/**
 * Keep /localities for frontend compatibility.
 * It uses the same unified controller for now.
 */
router.get('/localities', searchAddress);

module.exports = router;