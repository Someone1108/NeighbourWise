const express = require('express')
const router = express.Router()

const layerController = require('../controllers/layerController')

router.get('/suburb/:name', layerController.getLayersForSuburb)
router.get('/address', layerController.getLayersForAddress)

module.exports = router