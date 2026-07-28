const API_BASE_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const bookingIdInput =
  document.getElementById("bookingId");

const trackButton =
  document.getElementById("trackButton");

const messageBox =
  document.getElementById("message");

const trackingCard =
  document.getElementById("trackingCard");

const mapContainer =
  document.getElementById("mapContainer");

const bookingNumber =
  document.getElementById("bookingNumber");

const statusElement =
  document.getElementById("status");

const riderElement =
  document.getElementById("rider");

const pickupElement =
  document.getElementById("pickup");

const deliveryElement =
  document.getElementById("delivery");

const updatedElement =
  document.getElementById("updated");

let refreshInterval = null;
let activeBookingId = "";

let map = null;
let pickupMarker = null;
let deliveryMarker = null;
let riderMarker = null;
let routeLine = null;

function showMessage(
  message,
  type = "loading"
) {
  messageBox.textContent = message;
  messageBox.className =
    `message ${type}`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN");
}

function isValidCoordinate(
  latitude,
  longitude
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function createIcon(
  emoji,
  label
) {
  return L.divIcon({
    className: "custom-map-marker",
    html: `
      <div class="marker-wrapper">
        <div class="marker-icon">
          ${emoji}
        </div>
        <div class="marker-label">
          ${label}
        </div>
      </div>
    `,
    iconSize: [100, 50],
    iconAnchor: [50, 25]
  });
}

function initializeMap(
  latitude,
  longitude
) {
  if (map) {
    return;
  }

  map = L.map("trackingMap", {
    zoomControl: true
  }).setView(
    [latitude, longitude],
    14
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(map);
}

function updateInteractiveMap(
  tracking
) {
  const pickupLatitude =
    Number(tracking.pickupLatitude);

  const pickupLongitude =
    Number(tracking.pickupLongitude);

  const deliveryLatitude =
    Number(tracking.deliveryLatitude);

  const deliveryLongitude =
    Number(tracking.deliveryLongitude);

  const riderLatitude =
    Number(tracking.riderLatitude);

  const riderLongitude =
    Number(tracking.riderLongitude);

  const pickupValid =
    isValidCoordinate(
      pickupLatitude,
      pickupLongitude
    );

  const deliveryValid =
    isValidCoordinate(
      deliveryLatitude,
      deliveryLongitude
    );

  const riderValid =
    isValidCoordinate(
      riderLatitude,
      riderLongitude
    );

  if (
    !pickupValid &&
    !deliveryValid &&
    !riderValid
  ) {
    mapContainer.classList.remove(
      "active"
    );

    return;
  }

  let centerLatitude;
  let centerLongitude;

  if (riderValid) {
    centerLatitude = riderLatitude;
    centerLongitude = riderLongitude;
  } else if (pickupValid) {
    centerLatitude = pickupLatitude;
    centerLongitude = pickupLongitude;
  } else {
    centerLatitude = deliveryLatitude;
    centerLongitude = deliveryLongitude;
  }

  mapContainer.classList.add(
    "active"
  );

  initializeMap(
    centerLatitude,
    centerLongitude
  );

  setTimeout(
    () => {
      map.invalidateSize();
    },
    100
  );

  const visiblePoints = [];

  if (pickupValid) {
    const pickupPosition = [
      pickupLatitude,
      pickupLongitude
    ];

    visiblePoints.push(
      pickupPosition
    );

    if (!pickupMarker) {
      pickupMarker = L.marker(
        pickupPosition,
        {
          icon: createIcon(
            "📍",
            "Pickup"
          )
        }
      ).addTo(map);
    } else {
      pickupMarker.setLatLng(
        pickupPosition
      );
    }

    pickupMarker.bindPopup(`
      <strong>Pickup Location</strong><br>
      ${tracking.pickupLocation || "Not available"}
    `);
  }

  if (deliveryValid) {
    const deliveryPosition = [
      deliveryLatitude,
      deliveryLongitude
    ];

    visiblePoints.push(
      deliveryPosition
    );

    if (!deliveryMarker) {
      deliveryMarker = L.marker(
        deliveryPosition,
        {
          icon: createIcon(
            "🏁",
            "Delivery"
          )
        }
      ).addTo(map);
    } else {
      deliveryMarker.setLatLng(
        deliveryPosition
      );
    }

    deliveryMarker.bindPopup(`
      <strong>Delivery Location</strong><br>
      ${tracking.deliveryLocation || "Not available"}
    `);
  }

  if (riderValid) {
    const riderPosition = [
      riderLatitude,
      riderLongitude
    ];

    visiblePoints.push(
      riderPosition
    );

    if (!riderMarker) {
      riderMarker = L.marker(
        riderPosition,
        {
          icon: createIcon(
            "🛵",
            "Rider"
          )
        }
      ).addTo(map);
    } else {
      riderMarker.setLatLng(
        riderPosition
      );
    }

    riderMarker.bindPopup(`
      <strong>Rider Live Location</strong><br>
      ${tracking.assignedRider || "Assigned rider"}
    `);
  }

  if (routeLine) {
    map.removeLayer(
      routeLine
    );

    routeLine = null;
  }

  const routePoints = [];

  if (pickupValid) {
    routePoints.push([
      pickupLatitude,
      pickupLongitude
    ]);
  }

  if (riderValid) {
    routePoints.push([
      riderLatitude,
      riderLongitude
    ]);
  }

  if (deliveryValid) {
    routePoints.push([
      deliveryLatitude,
      deliveryLongitude
    ]);
  }

  if (routePoints.length >= 2) {
    routeLine = L.polyline(
      routePoints,
      {
        weight: 5,
        opacity: 0.75,
        dashArray: "10, 8"
      }
    ).addTo(map);
  }

  if (visiblePoints.length === 1) {
    map.setView(
      visiblePoints[0],
      15
    );
  } else if (
    visiblePoints.length > 1
  ) {
    const bounds =
      L.latLngBounds(
        visiblePoints
      );

    map.fitBounds(
      bounds,
      {
        padding: [50, 50],
        maxZoom: 16
      }
    );
  }
}

function renderTracking(
  tracking
) {
  bookingNumber.textContent =
    tracking.bookingId || "-";

  statusElement.textContent =
    tracking.status || "-";

  riderElement.textContent =
    tracking.assignedRider ||
    "Not assigned yet";

  pickupElement.textContent =
    tracking.pickupLocation || "-";

  deliveryElement.textContent =
    tracking.deliveryLocation || "-";

  updatedElement.textContent =
    formatDate(
      tracking.lastUpdated
    );

  trackingCard.classList.add(
    "active"
  );

  updateInteractiveMap(
    tracking
  );
}

async function loadTracking(
  bookingId,
  isAutoRefresh = false
) {
  try {
    if (!isAutoRefresh) {
      showMessage(
        "Loading tracking details...",
        "loading"
      );

      trackButton.disabled = true;
    }

    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(
        bookingId
      )}/tracking`
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.message ||
        "Unable to track booking"
      );
    }

    renderTracking(
      data.tracking
    );

    showMessage(
      isAutoRefresh
        ? "Live location updated"
        : "Booking found successfully",
      "success"
    );

  } catch (error) {
    console.error(
      "Tracking error:",
      error
    );

    if (!isAutoRefresh) {
      trackingCard.classList.remove(
        "active"
      );

      mapContainer.classList.remove(
        "active"
      );
    }

    showMessage(
      error.message ||
      "Unable to load tracking",
      "error"
    );

  } finally {
    if (!isAutoRefresh) {
      trackButton.disabled = false;
    }
  }
}

function startAutoRefresh(
  bookingId
) {
  if (refreshInterval) {
    clearInterval(
      refreshInterval
    );
  }

  refreshInterval =
    setInterval(
      () => {
        loadTracking(
          bookingId,
          true
        );
      },
      15000
    );
}

function trackBooking() {
  const bookingId =
    bookingIdInput.value.trim();

  if (!bookingId) {
    showMessage(
      "Please enter a Booking ID",
      "error"
    );

    return;
  }

  activeBookingId =
    bookingId;

  loadTracking(
    activeBookingId
  );

  startAutoRefresh(
    activeBookingId
  );
}

trackButton.addEventListener(
  "click",
  trackBooking
);

bookingIdInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
    ) {
      trackBooking();
    }
  }
);

window.addEventListener(
  "beforeunload",
  () => {
    if (refreshInterval) {
      clearInterval(
        refreshInterval
      );
    }
  }
);