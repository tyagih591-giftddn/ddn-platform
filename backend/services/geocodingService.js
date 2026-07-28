const axios = require("axios");

async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error("Address is required.");
  }

  const query = `${address}, Ghaziabad, Uttar Pradesh, India`;

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: query,
          format: "jsonv2",
          limit: 1,
          countrycodes: "in"
        },
        headers: {
          "User-Agent": "DDN Platform/1.0"
        },
        timeout: 10000
      }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error("Location not found.");
    }

    return {
      latitude: Number(response.data[0].lat),
      longitude: Number(response.data[0].lon),
      displayName: response.data[0].display_name
    };

  } catch (error) {
    throw new Error(
      "Unable to convert address into map location."
    );
  }
}

module.exports = {
  geocodeAddress
};