const { fetchCouncilLinks } = require('../services/councilLinkService');

async function getCouncilLinks(req, res) {
  try {
    const data = await fetchCouncilLinks({
      lat: req.query.lat,
      lng: req.query.lng,
      lgaName: req.query.lgaName,
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching council links:', error.message);
    res.status(500).json({ error: 'Failed to fetch council links' });
  }
}

module.exports = {
  getCouncilLinks,
};
