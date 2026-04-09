const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/searchRoutes');
const localityRoutes = require('./routes/localityRoutes');
const layerRoutes = require('./routes/layerRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'NeighbourWise backend is running' });
});

app.use('/api/search', searchRoutes);
app.use('/api/locality', localityRoutes);
app.use('/api/layers', layerRoutes);

module.exports = app;