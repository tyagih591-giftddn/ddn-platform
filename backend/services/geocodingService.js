const axios = require("axios");

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

async function searchLocation(query) {
  const response = await axios.get(NOMINATIM_URL, {
    params: {
      q: query,
      format: "jsonv2",
      limit: 1,
      addressdetails: 1,
      countrycodes: "in"
    },
    headers: {
      "User-Agent":
        "DDN Platform/1.0 (ddn-platform-support@gmail.com)",
      Accept: "application/json"
    },
    timeout: 10000
  });

  if (
    Array.isArray(response.data) &&
    response.data.length > 0
  ) {
    return response.data[0];
  }

  return null;
}

async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error("Address is required.");
  }

  const cleanAddress = address.trim();

  const queries = [
    `${cleanAddress}, Ghaziabad, Uttar Pradesh, India`,
    `${cleanAddress}, Ghaziabad, Uttar Pradesh`,
    `${cleanAddress}, Ghaziabad`,
    `${cleanAddress}, India`,
    cleanAddress
  ];

  for (const query of queries) {
    try {
      console.log("Trying geocoding query:", query);

      const result = await searchLocation(query);

      if (result) {
        console.log("Geocoding Success:", result.display_name);

        return {
          latitude: Number(result.lat),
          longitude: Number(result.lon),
          displayName: result.display_name
        };
      }

      console.log("No result for:", query);

    } catch (error) {
      console.error("Query failed:", {
        query,
        message: error.message,
        status: error.response?.status,
        code: error.code
      });
    }
  }

  throw new Error("Location not found.");
}

module.exports = {
  geocodeAddress
};