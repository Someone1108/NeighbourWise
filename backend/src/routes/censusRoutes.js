const express = require('express');
const {
  getLocationProfile,
  getPostcodeProfile,
  getSa2Profile,
  getSuburbProfile,
} = require('../controllers/censusController');

const router = express.Router();

router.get('/location', getLocationProfile);
router.get('/suburb/:name', getSuburbProfile);
router.get('/postcode/:postcode', getPostcodeProfile);
router.get('/sa2/:code', getSa2Profile);

module.exports = router;
