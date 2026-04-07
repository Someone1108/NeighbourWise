const express = require('express');
const router = express.Router();
const localities = require('../data/localities.json');

router.get('/localities', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();

  if (!q) {
    return res.json([]);
  }

  const results = localities.filter(item =>
    item.name.toLowerCase().includes(q)
  );

  res.json(results);
});

module.exports = router;