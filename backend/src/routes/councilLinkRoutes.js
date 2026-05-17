const express = require('express');
const { getCouncilLinks } = require('../controllers/councilLinkController');

const router = express.Router();

router.get('/', getCouncilLinks);

module.exports = router;
