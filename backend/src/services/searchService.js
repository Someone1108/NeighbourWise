const axios = require('axios');

const searchAddresses = async (query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const accessToken = process.env.MAPBOX_TOKEN;


  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN is missing in .env');
  }

  const url = 'https://api.mapbox.com/search/geocode/v6/forward';

  const response = await axios.get(url, {
    params: {
      q: query,
      access_token: accessToken,
      limit: 5,
      country: 'au'
    }
  });

  const features = response.data.features || [];

  return features.map((feature) => ({
    id: feature.properties?.mapbox_id || feature.id,
    name: feature.properties?.name || feature.text || '',
    fullAddress: feature.properties?.full_address || feature.place_name || '',
    lat: feature.geometry?.coordinates?.[1],
    lng: feature.geometry?.coordinates?.[0],
    placeType: feature.properties?.feature_type || 'address'
  }));
};

module.exports = {
  searchAddresses
};