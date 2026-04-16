const express = require('express');
const { searchAddress } = require('../controllers/searchController');

const router = express.Router();

/**
 * Unified search endpoint:
 * returns suburb/locality results from Supabase
 * plus postcode/address results from Mapbox
 */
router.get('/address', searchAddress);

/**
 * Kept for frontend compatibility.
 * Currently this also uses the same unified search flow.
 */
router.get('/localities', searchAddress);

module.exports = router;