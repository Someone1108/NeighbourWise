const express = require('express');
const cors = require('cors');

const {
  apiRateLimiter,
  createCorsOptions,
  createSecurityHeaders,
  expensiveApiRateLimiter,
  requireApiAccess,
} = require('./middleware/security');
const searchRoutes = require('./routes/searchRoutes');
const localityRoutes = require('./routes/localityRoutes');
const insightRoutes = require('./routes/insightRoutes');
const layerRoutes = require('./routes/layerRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const aqiRoutes = require('./routes/aqiRoutes');
const censusRoutes = require('./routes/censusRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const councilLinkRoutes = require('./routes/councilLinkRoutes');

const app = express();

app.use(createSecurityHeaders());
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: '20kb' }));

app.get('/', (req, res) => {
  res.json({ message: 'NeighbourWise backend is running' });
});

app.use('/api', apiRateLimiter);
app.use('/api', requireApiAccess);
app.use(
  [
    '/api/search',
    '/api/score',
    '/api/layers',
    '/api/aqi',
    '/api/recommendations',
  ],
  expensiveApiRateLimiter
);

app.use('/api/search', searchRoutes);
app.use('/api/locality', localityRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/layers', layerRoutes);
app.use('/api/score', scoreRoutes);
app.use('/api/aqi', aqiRoutes);
app.use('/api/census', censusRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/council-links', councilLinkRoutes);

app.use((err, req, res, next) => {
  if (err && err.message === 'CORS origin is not allowed') {
    return res.status(403).json({ error: 'CORS origin is not allowed' });
  }

  console.error('Unhandled API error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
