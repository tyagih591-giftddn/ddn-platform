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
          "User-Agent":
            "DDN Platform/1.0 (ddn-platform-support@gmail.com)",
          Accept: "application/json"
        },
        timeout: 10000
      }
    );

    if (
      !Array.isArray(response.data) ||
      response.data.length === 0
    ) {
      throw new Error("Location not found.");
    }

    const latitude = Number(response.data[0].lat);
    const longitude = Number(response.data[0].lon);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error(
        "Invalid coordinates received from geocoding service."
      );
    }

    return {
      latitude,
      longitude,
      displayName:
        response.data[0].display_name || address
    };
  } catch (error) {
    console.error("Geocoding API Error:", {
      address,
      query,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    throw new Error(
      error.response?.data?.error ||
        error.message ||
        "Unable to convert address into map location."
    );
  }
}

module.exports = {
  geocodeAddress
};