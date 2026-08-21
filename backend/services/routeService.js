const axios = require("axios");

const OSRM_BASE_URL =
  "https://router.project-osrm.org/route/v1/driving";

function validateCoordinate(
  latitude,
  longitude
) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function calculateRoadRoute(
  pickupLatitude,
  pickupLongitude,
  deliveryLatitude,
  deliveryLongitude
) {
  if (
    !validateCoordinate(
      pickupLatitude,
      pickupLongitude
    ) ||
    !validateCoordinate(
      deliveryLatitude,
      deliveryLongitude
    )
  ) {
    throw new Error(
      "Valid pickup and delivery coordinates are required."
    );
  }

  const coordinates =
    `${Number(pickupLongitude)},${Number(pickupLatitude)};` +
    `${Number(deliveryLongitude)},${Number(deliveryLatitude)}`;

  try {
    const response =
      await axios.get(
        `${OSRM_BASE_URL}/${coordinates}`,
        {
          params: {
            overview: "false",
            alternatives: "false",
            steps: "false"
          },
          timeout: 10000
        }
      );

    const route =
      response.data?.routes?.[0];

    if (!route) {
      throw new Error(
        "Road route was not found."
      );
    }

    const distanceMeters =
      Number(route.distance);

    const durationSeconds =
      Number(route.duration);

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= 0
    ) {
      throw new Error(
        "Valid road distance was not received."
      );
    }

    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new Error(
        "Valid route duration was not received."
      );
    }

    return {
      distanceMeters,

      distanceKm:
        Number(
          (
            distanceMeters / 1000
          ).toFixed(2)
        ),

      durationSeconds,

      durationMinutes:
        Math.max(
          1,
          Math.ceil(
            durationSeconds / 60
          )
        )
    };
  } catch (error) {
    console.error(
      "Road routing error:",
      error.response?.data ||
      error.message
    );

    throw new Error(
      "Road route could not be calculated."
    );
  }
}

module.exports = {
  calculateRoadRoute
};