const API_BASE_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const AUTO_REFRESH_TIME = 15000;

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
let mapAlreadyFitted = false;

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

function convertCoordinate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function isValidCoordinate(
  latitude,
  longitude
) {
  return (
    latitude !== null &&
    longitude !== null &&
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

    iconSize: [100, 58],
    iconAnchor: [50, 45],
    popupAnchor: [0, -40]
  });
}

function initializeMap(
  latitude,
  longitude
) {
  if (map) {
    return;
  }

  map = L.map(
    "trackingMap",
    {
      zoomControl: true,
      preferCanvas: true
    }
  ).setView(
    [latitude, longitude],
    14
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      minZoom: 3,
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0,
      attribution:
        "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);
}

function updateOrCreateMarker(
  existingMarker,
  position,
  icon,
  popupContent
) {
  if (!existingMarker) {
    existingMarker = L.marker(
      position,
      {
        icon
      }
    ).addTo(map);
  } else {
    existingMarker.setLatLng(
      position
    );

    existingMarker.setIcon(
      icon
    );
  }

  existingMarker.bindPopup(
    popupContent
  );

  return existingMarker;
}

function removeMarker(marker) {
  if (
    marker &&
    map
  ) {
    map.removeLayer(marker);
  }

  return null;
}

function resizeAndPositionMap(
  visiblePoints,
  forceFit = false
) {
  if (!map) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      map.invalidateSize({
        pan: false,
        animate: false
      });

      if (
        visiblePoints.length === 0
      ) {
        return;
      }

      if (
        visiblePoints.length === 1
      ) {
        if (
          forceFit ||
          !mapAlreadyFitted
        ) {
          map.setView(
            visiblePoints[0],
            15,
            {
              animate: false
            }
          );

          mapAlreadyFitted = true;
        }

        return;
      }

      if (
        forceFit ||
        !mapAlreadyFitted
      ) {
        const bounds =
          L.latLngBounds(
            visiblePoints
          );

        map.fitBounds(
          bounds,
          {
            padding: [55, 55],
            maxZoom: 16,
            animate: false
          }
        );

        mapAlreadyFitted = true;
      }
    });
  });
}

function updateInteractiveMap(
  tracking,
  forceFit = false
) {
  if (
    typeof L === "undefined"
  ) {
    throw new Error(
      "Map library could not load. Please refresh the page."
    );
  }

  const pickupLatitude =
    convertCoordinate(
      tracking.pickupLatitude
    );

  const pickupLongitude =
    convertCoordinate(
      tracking.pickupLongitude
    );

  const deliveryLatitude =
    convertCoordinate(
      tracking.deliveryLatitude
    );

  const deliveryLongitude =
    convertCoordinate(
      tracking.deliveryLongitude
    );

  const riderLatitude =
    convertCoordinate(
      tracking.riderLatitude
    );

  const riderLongitude =
    convertCoordinate(
      tracking.riderLongitude
    );

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

  let firstPosition;

  if (riderValid) {
    firstPosition = [
      riderLatitude,
      riderLongitude
    ];
  } else if (pickupValid) {
    firstPosition = [
      pickupLatitude,
      pickupLongitude
    ];
  } else {
    firstPosition = [
      deliveryLatitude,
      deliveryLongitude
    ];
  }

  mapContainer.classList.add(
    "active"
  );

  initializeMap(
    firstPosition[0],
    firstPosition[1]
  );

  const visiblePoints = [];
  const routePoints = [];

  if (pickupValid) {
    const pickupPosition = [
      pickupLatitude,
      pickupLongitude
    ];

    visiblePoints.push(
      pickupPosition
    );

    routePoints.push(
      pickupPosition
    );

    pickupMarker =
      updateOrCreateMarker(
        pickupMarker,
        pickupPosition,
        createIcon(
          "📍",
          "Pickup"
        ),
        `
          <strong>Pickup Location</strong>
          <br>
          ${tracking.pickupLocation || "Not available"}
        `
      );
  } else {
    pickupMarker =
      removeMarker(
        pickupMarker
      );
  }

  if (riderValid) {
    const riderPosition = [
      riderLatitude,
      riderLongitude
    ];

    visiblePoints.push(
      riderPosition
    );

    routePoints.push(
      riderPosition
    );

    riderMarker =
      updateOrCreateMarker(
        riderMarker,
        riderPosition,
        createIcon(
          "🛵",
          "Rider"
        ),
        `
          <strong>Rider Live Location</strong>
          <br>
          ${tracking.assignedRider || "Assigned rider"}
        `
      );
  } else {
    riderMarker =
      removeMarker(
        riderMarker
      );
  }

  if (deliveryValid) {
    const deliveryPosition = [
      deliveryLatitude,
      deliveryLongitude
    ];

    visiblePoints.push(
      deliveryPosition
    );

    routePoints.push(
      deliveryPosition
    );

    deliveryMarker =
      updateOrCreateMarker(
        deliveryMarker,
        deliveryPosition,
        createIcon(
          "🏁",
          "Delivery"
        ),
        `
          <strong>Delivery Location</strong>
          <br>
          ${tracking.deliveryLocation || "Not available"}
        `
      );
  } else {
    deliveryMarker =
      removeMarker(
        deliveryMarker
      );
  }

  if (routeLine) {
    map.removeLayer(
      routeLine
    );

    routeLine = null;
  }

  if (
    routePoints.length >= 2
  ) {
    routeLine = L.polyline(
      routePoints,
      {
        weight: 5,
        opacity: 0.8,
        dashArray: "10, 8",
        lineCap: "round",
        lineJoin: "round"
      }
    ).addTo(map);
  }

  resizeAndPositionMap(
    visiblePoints,
    forceFit
  );
}

function renderTracking(
  tracking,
  forceFit = false
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
    tracking,
    forceFit
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
      )}/tracking`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Server returned an invalid response"
      );
    }

    if (
      !response.ok ||
      !data.success ||
      !data.tracking
    ) {
      throw new Error(
        data.message ||
        "Unable to track booking"
      );
    }

    renderTracking(
      data.tracking,
      !isAutoRefresh
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

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(
      refreshInterval
    );

    refreshInterval = null;
  }
}

function startAutoRefresh(
  bookingId
) {
  stopAutoRefresh();

  refreshInterval =
    setInterval(
      () => {
        if (document.hidden) {
          return;
        }

        loadTracking(
          bookingId,
          true
        );
      },
      AUTO_REFRESH_TIME
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

    bookingIdInput.focus();

    return;
  }

  if (
    bookingId !== activeBookingId
  ) {
    mapAlreadyFitted = false;
  }

  activeBookingId =
    bookingId;

  loadTracking(
    activeBookingId,
    false
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

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      !document.hidden &&
      activeBookingId
    ) {
      loadTracking(
        activeBookingId,
        true
      );
    }
  }
);

window.addEventListener(
  "resize",
  () => {
    if (map) {
      map.invalidateSize({
        pan: false,
        animate: false
      });
    }
  }
);

window.addEventListener(
  "beforeunload",
  stopAutoRefresh
);