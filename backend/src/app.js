const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/searchRoutes');
const localityRoutes = require('./routes/localityRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'NeighbourWise backend is running' });
});

app.use('/api/search', searchRoutes);
app.use('/api/locality', localityRoutes);

module.exports = app;