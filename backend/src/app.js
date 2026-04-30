const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/searchRoutes');
const localityRoutes = require('./routes/localityRoutes');
const insightRoutes = require('./routes/insightRoutes');
const layerRoutes = require('./routes/layerRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const aqiRoutes = require('./routes/aqiRoutes');
const censusRoutes = require('./routes/censusRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'NeighbourWise backend is running' });
});

app.use('/api/search', searchRoutes);
app.use('/api/locality', localityRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/layers', layerRoutes);
app.use('/api/score', scoreRoutes);
app.use('/api/aqi', aqiRoutes);
app.use('/api/census', censusRoutes);

module.exports = app;
