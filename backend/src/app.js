const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/searchRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'NeighbourWise backend is running' });
});

app.use('/api/search', searchRoutes);

module.exports = app;