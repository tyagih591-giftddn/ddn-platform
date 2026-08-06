const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";

  const SOCKET_URL =
  "https://ddn-platform.onrender.com";

let adminSocket = null;

// ===============================
// ADMIN LIVE MAP
// ===============================

let adminAlertAudio = null;
let adminAlertStopTimer = null;
let adminAlertEnabled = false;


async function enableAdminAlerts() {

  console.log(
    "enableAdminAlerts() called"
  );

  if (!adminAlertAudio) {

    adminAlertAudio =
      new Audio(
        "sounds/new-order.mp3"
      );

    adminAlertAudio.loop = true;
    adminAlertAudio.volume = 1;
    adminAlertAudio.preload = "auto";

  }

  adminAlertEnabled = true;

  localStorage.setItem(
    "ddnAdminAlertsEnabled",
    "true"
  );

  console.log(
    "Admin alerts enabled"
  );

  if (
    "Notification" in window &&
    Notification.permission === "default"
  ) {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn(error);
    }
  }

}


function connectAdminSocket() {
  if (
    adminSocket &&
    adminSocket.connected
  ) {
    return;
  }

  if (typeof io === "undefined") {
    console.error(
      "Socket.IO client is not loaded"
    );

    return;
  }

  adminSocket =
    io(SOCKET_URL, {
      transports: [
        "websocket",
        "polling"
      ]
    });

  adminSocket.on(
    "connect",
    () => {
      console.log(
        "Admin socket connected:",
        adminSocket.id
      );
    }
  );

adminSocket.on(
  "new-order",
  async booking => {

    console.log(
      "Realtime order:",
      booking
    );

    startAdminAlarm();

    if (
      "Notification" in window &&
      Notification.permission ===
        "granted"
    ) {
      new Notification(
        "🚚 New DDN Order",
        {
          body:
            booking.bookingId +
            " - " +
            booking.customerName
        }
      );
    }

    try {

      await loadBookings();

    } catch (error) {

      console.error(
        "Unable to refresh bookings after realtime order:",
        error
      );

    }

  }
);
  
adminSocket.on(
  "booking-status-updated",
  async booking => {

    console.log(
      "Realtime booking status update:",
      booking
    );

    await loadBookings();

  }
);

adminSocket.on(
  "rider-location-updated",
  async riderLocation => {

    console.log(
      "Realtime rider location:",
      riderLocation
    );

    await loadBookings();

  }
);

  adminSocket.on(
    "disconnect",
    reason => {
      console.warn(
        "Admin socket disconnected:",
        reason
      );
    }
  );

  adminSocket.on(
    "connect_error",
    error => {
      console.error(
        "Admin socket connection error:",
        error.message
      );
    }
  );
}

function startAdminAlarm() {

  console.log(
    "startAdminAlarm() called"
  );

  if (
    !adminAlertEnabled ||
    !adminAlertAudio
  ) {
    console.warn(
      "Admin alarm not ready",
      {
        adminAlertEnabled,
        hasAudio:
          Boolean(
            adminAlertAudio
          )
      }
    );

    return;
  }

  stopAdminAlarm();

adminAlertAudio.load();

  adminAlertAudio.currentTime = 0;

  adminAlertAudio
    .play()
    .then(() => {

      console.log(
        "Playing admin alarm"
      );

    })
    .catch(error => {

      console.error(
        "Unable to play admin alarm:",
        error
      );

    });

}


function stopAdminAlarm() {

  if (adminAlertAudio) {

    adminAlertAudio.pause();
    adminAlertAudio.currentTime = 0;

  }

  if (adminAlertStopTimer) {

    clearTimeout(
      adminAlertStopTimer
    );

    adminAlertStopTimer = null;

  }

}

let adminMap = null;

let adminMarkers = [];

let adminRoutes = [];

// ===============================
// AUTO REFRESH
// ===============================

let autoRefreshInterval = null;

const AUTO_REFRESH_TIME = 15000; // 15 seconds

// ===============================
// BOOKING FILTERS
// ===============================

let allAdminBookings = [];

let currentBookingFilter = "all";

function clearAdminMap() {

  adminMarkers.forEach(marker => {
    adminMap.removeLayer(marker);
  });

  adminRoutes.forEach(route => {
    adminMap.removeLayer(route);
  });

  adminMarkers = [];
  adminRoutes = [];

}

function createAdminMarker(
  emoji,
  label
) {

  return L.divIcon({

    className:
      "admin-map-marker",

    html: `
      <div class="admin-marker-wrapper">

        <div class="admin-marker-icon">
          ${emoji}
        </div>

        <div class="admin-marker-label">
          ${label}
        </div>

      </div>
    `,

    iconSize: [90, 50],
    iconAnchor: [45, 45]

  });

}

function initializeAdminMap() {

  if (adminMap) {
    return;
  }

  adminMap = L.map(
    "adminLiveMap"
  ).setView(
    [28.6139, 77.2090],
    11
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        "&copy; OpenStreetMap contributors"
    }
  ).addTo(adminMap);

}

function isValidMapCoordinate(
  latitude,
  longitude
) {
  if (
    latitude === null ||
    latitude === undefined ||
    latitude === "" ||
    longitude === null ||
    longitude === undefined ||
    longitude === ""
  ) {
    return false;
  }

  const numericLatitude =
    Number(latitude);

  const numericLongitude =
    Number(longitude);

  return (
    Number.isFinite(
      numericLatitude
    ) &&
    Number.isFinite(
      numericLongitude
    ) &&
    numericLatitude >= -90 &&
    numericLatitude <= 90 &&
    numericLongitude >= -180 &&
    numericLongitude <= 180 &&
    !(
      numericLatitude === 0 &&
      numericLongitude === 0
    )
  );
}

async function loadAdminLiveMap(
  bookings
) {
  const messageElement =
    document.getElementById(
      "adminMapMessage"
    );

  if (
    typeof L === "undefined"
  ) {
    messageElement.textContent =
      "Map library could not load.";

    return;
  }

  initializeAdminMap();
  clearAdminMap();

  const activeBookings =
    bookings.filter(
      booking =>
        booking.status !==
          "Delivered" &&
        booking.status !==
          "Cancelled"
    );

  if (
    activeBookings.length === 0
  ) {
    messageElement.textContent =
      "No active deliveries found.";

    adminMap.setView(
      [28.6139, 77.2090],
      11
    );

    setTimeout(() => {
      adminMap.invalidateSize();
    }, 200);

    return;
  }

  messageElement.textContent =
    "Loading live rider locations...";

  const trackingRequests =
    activeBookings.map(
      async booking => {
        try {
          const response =
            await fetch(
              `${API_URL}/${encodeURIComponent(
                booking.bookingId
              )}/tracking`,
              {
                method: "GET",
                cache: "no-store"
              }
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data.success ||
            !data.tracking
          ) {
            return null;
          }

          return data.tracking;
        } catch (error) {
          console.error(
            "Admin tracking error:",
            error
          );

          return null;
        }
      }
    );

  const trackingResults =
    await Promise.all(
      trackingRequests
    );

  const validTrackingResults =
    trackingResults.filter(
      tracking => tracking
    );

  const visiblePoints = [];

  validTrackingResults.forEach(
    tracking => {
      
      const pickupLatitude =
  tracking.pickupLatitude;

const pickupLongitude =
  tracking.pickupLongitude;

const deliveryLatitude =
  tracking.deliveryLatitude;

const deliveryLongitude =
  tracking.deliveryLongitude;

const riderLatitude =
  tracking.riderLatitude;

const riderLongitude =
  tracking.riderLongitude;

      const pickupValid =
        isValidMapCoordinate(
          pickupLatitude,
          pickupLongitude
        );

      const deliveryValid =
        isValidMapCoordinate(
          deliveryLatitude,
          deliveryLongitude
        );

      const riderValid =
        isValidMapCoordinate(
          riderLatitude,
          riderLongitude
        );

        const riderAssigned =
  !!tracking.assignedRider;

      const routePoints = [];

      if (pickupValid) {
        const pickupPosition = [
  Number(pickupLatitude),
  Number(pickupLongitude)
];
        visiblePoints.push(
          pickupPosition
        );

        routePoints.push(
          pickupPosition
        );

        const pickupMarker =
          L.marker(
            pickupPosition,
            {
              icon:
                createAdminMarker(
                  "📍",
                  "Pickup"
                )
            }
          ).addTo(adminMap);

        pickupMarker.bindPopup(`
          <strong>
            Pickup
          </strong>
          <br>
          Booking:
          ${escapeHtml(
            tracking.bookingId
          )}
          <br>
          ${escapeHtml(
            tracking.pickupLocation ||
            "Not available"
          )}
        `);

        adminMarkers.push(
          pickupMarker
        );
      }

      if (riderAssigned && riderValid) {
        const riderPosition = [
  Number(riderLatitude),
  Number(riderLongitude)
];

        visiblePoints.push(
          riderPosition
        );

        routePoints.push(
          riderPosition
        );

        const riderMarker =
          L.marker(
            riderPosition,
            {
              icon:
                createAdminMarker(
                  "🛵",
                  tracking.assignedRider ||
                  "Rider"
                ),
              zIndexOffset: 1000
            }
          ).addTo(adminMap);

        riderMarker.bindPopup(`
          <strong>
            Rider Live Location
          </strong>
          <br>
          Rider:
          ${escapeHtml(
            tracking.assignedRider ||
            "Not assigned"
          )}
          <br>
          Booking:
          ${escapeHtml(
            tracking.bookingId
          )}
          <br>
          Status:
          ${escapeHtml(
            tracking.status
          )}
        `);

        adminMarkers.push(
          riderMarker
        );
      }

      if (deliveryValid) {
        const deliveryPosition = [
  Number(deliveryLatitude),
  Number(deliveryLongitude)
];

        visiblePoints.push(
          deliveryPosition
        );

        routePoints.push(
          deliveryPosition
        );

        const deliveryMarker =
          L.marker(
            deliveryPosition,
            {
              icon:
                createAdminMarker(
                  "🏁",
                  "Delivery"
                )
            }
          ).addTo(adminMap);

        deliveryMarker.bindPopup(`
          <strong>
            Delivery
          </strong>
          <br>
          Booking:
          ${escapeHtml(
            tracking.bookingId
          )}
          <br>
          ${escapeHtml(
            tracking.deliveryLocation ||
            "Not available"
          )}
        `);

        adminMarkers.push(
          deliveryMarker
        );
      }

      if (
        routePoints.length >= 2
      ) {
        const route =
          L.polyline(
            routePoints,
            {
              weight: 4,
              opacity: 0.75,
              dashArray: "10, 8"
            }
          ).addTo(adminMap);

        adminRoutes.push(
          route
        );
      }
    }
  );

  if (
    visiblePoints.length === 0
  ) {
    messageElement.textContent =
      "Active bookings found, but GPS locations are not available.";

    adminMap.setView(
      [28.6139, 77.2090],
      11
    );
  } else if (
    visiblePoints.length === 1
  ) {
    adminMap.setView(
      visiblePoints[0],
      15
    );

    messageElement.textContent =
      `${validTrackingResults.length} active delivery loaded.`;
  } else {
    adminMap.fitBounds(
      L.latLngBounds(
        visiblePoints
      ),
      {
        padding: [50, 50],
        maxZoom: 16
      }
    );

    messageElement.textContent =
      `${validTrackingResults.length} active deliveries shown on map.`;
  }

  setTimeout(() => {
    adminMap.invalidateSize();
  }, 250);
}

// ===============================
// GET ADMIN TOKEN
// ===============================

function getAdminToken() {
  return localStorage.getItem(
    "ddnAdminToken"
  );
}


// ===============================
// CLEAR ADMIN LOGIN
// ===============================

function clearAdminLogin() {

  localStorage.removeItem(
    "ddnAdminLoggedIn"
  );

  localStorage.removeItem(
    "ddnAdminToken"
  );

  localStorage.removeItem(
    "ddnAdminUsername"
  );

}


// ===============================
// SHOW LOGIN SCREEN
// ===============================

function showLoginScreen(
  message = ""
) {


  document
    .getElementById("dashboardSection")
    .style.display =
    "none";

  document
    .getElementById("loginSection")
    .style.display =
    "block";

  document
    .getElementById("loginForm")
    .reset();

  const loginMessage =
    document.getElementById(
      "loginMessage"
    );

  loginMessage.textContent =
    message;

  loginMessage.style.color =
    message
      ? "red"
      : "#333";

}


// ===============================
// HANDLE AUTH ERROR
// ===============================

function handleAuthError(
  response,
  data
) {

  if (
    response.status === 401 ||
    response.status === 403
  ) {

    clearAdminLogin();

    showLoginScreen(
      data.message ||
      "Your login session has expired. Please login again."
    );

    return true;
  }

  return false;

}


// ===============================
// ADMIN LOGIN
// ===============================

const loginForm =
  document.getElementById(
    "loginForm"
  );

loginForm.addEventListener(
  "submit",
  async function (e) {

    e.preventDefault();

    const username =
      document
        .getElementById(
          "adminUsername"
        )
        .value
        .trim();

    const password =
      document
        .getElementById(
          "adminPassword"
        )
        .value;

    const loginMessage =
      document.getElementById(
        "loginMessage"
      );

    loginMessage.textContent =
      "Logging in...";

    loginMessage.style.color =
      "#333";

    try {

      const response =
        await fetch(
          LOGIN_API,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              username,
              password,
              role: "admin"
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        loginMessage.textContent =
          data.message ||
          "Invalid username or password.";

        loginMessage.style.color =
          "red";

        return;
      }

      if (!data.token) {

        loginMessage.textContent =
          "Login token was not received.";

        loginMessage.style.color =
          "red";

        return;
      }

      localStorage.setItem(
        "ddnAdminLoggedIn",
        "true"
      );

      localStorage.setItem(
        "ddnAdminToken",
        data.token
      );

      localStorage.setItem(
        "ddnAdminUsername",
        data.username || username
      );

      loginMessage.textContent =
        "";

        await enableAdminAlerts();

      showDashboard();

    } catch (error) {

      console.error(error);

      loginMessage.textContent =
        "Unable to connect to DDN server.";

      loginMessage.style.color =
        "red";

    }

  }
);


// ===============================
// SHOW DASHBOARD
// ===============================

function showDashboard() {

  const token =
    getAdminToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  document
    .getElementById("loginSection")
    .style.display =
    "none";

  document
    .getElementById("dashboardSection")
    .style.display =
    "block";

  loadBookings();

  connectAdminSocket();

}


// ===============================
// LOGOUT
// ===============================


document
  .getElementById(
    "logoutButton"
  )
  .addEventListener(
    "click",
    function () {

       clearAdminLogin();

      showLoginScreen();

    }
  );


// ===============================
// CHECK SAVED LOGIN
// ===============================

const savedLogin =
  localStorage.getItem(
    "ddnAdminLoggedIn"
  );

const savedToken =
  getAdminToken();

if (
  savedLogin === "true" &&
  savedToken
) {

  showDashboard();

} else {

  showLoginScreen();

}


// ===============================
// SAFE TEXT
// ===============================

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

// ===============================
// FILTER BOOKINGS
// ===============================

function getFilteredBookings() {

  if (
    currentBookingFilter === "pending"
  ) {
    return allAdminBookings.filter(
      booking =>
        booking.status === "Pending"
    );
  }

  if (
    currentBookingFilter === "completed"
  ) {
    return allAdminBookings.filter(
      booking =>
        booking.status === "Delivered"
    );
  }

  if (
    currentBookingFilter === "active"
  ) {
    return allAdminBookings.filter(
      booking =>
        booking.status !== "Delivered" &&
        booking.status !== "Cancelled"
    );
  }

  return allAdminBookings;
}

function updateBookingFilterMessage() {

  const messageElement =
    document.getElementById(
      "bookingFilterMessage"
    );

  if (!messageElement) {
    return;
  }

  const messages = {
    all: "Showing all bookings",
    pending: "Showing pending bookings",
    completed: "Showing completed bookings",
    active: "Showing active deliveries"
  };

  messageElement.textContent =
    messages[currentBookingFilter] ||
    messages.all;
}

function updateActiveFilterCard() {

  const cards =
    document.querySelectorAll(
      ".dashboard-filter-card"
    );

  cards.forEach(card => {

    const filter =
      card.dataset.bookingFilter;

    card.classList.toggle(
      "active-filter-card",
      filter === currentBookingFilter
    );

  });
}

// ===============================
// DASHBOARD FILTER CARD CLICKS
// ===============================

const dashboardFilterCards =
  document.querySelectorAll(
    ".dashboard-filter-card"
  );

dashboardFilterCards.forEach(card => {

  card.addEventListener(
    "click",
    async function () {

      currentBookingFilter =
        this.dataset.bookingFilter ||
        "all";

      updateActiveFilterCard();

      updateBookingFilterMessage();

      await loadBookings();

      document
        .querySelector(
          ".bookings-section"
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

    }
  );

});


// ===============================
// LOAD BOOKINGS
// ===============================

async function loadBookings() {

  const container =
    document.getElementById(
      "bookingsContainer"
    );

  container.innerHTML =
    "<p>Loading bookings...</p>";

  const token =
    getAdminToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  try {

    const response =
      await fetch(
        API_URL,
        {
          method: "GET",

          headers: {
            "Authorization":
              `Bearer ${token}`
          }
        }
      );

    const data =
      await response.json();

    if (
      handleAuthError(
        response,
        data
      )
    ) {
      return;
    }

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load bookings"
      );

    }

    const bookings =
      data.bookings || [];



      
allAdminBookings = bookings;

const filteredBookings =
  getFilteredBookings();

updateBookingFilterMessage();

updateActiveFilterCard();

    document
      .getElementById(
        "totalBookings"
      )
      .textContent =
      bookings.length;

    const pending =
      bookings.filter(
        booking =>
          booking.status ===
          "Pending"
      ).length;

    const completed =
      bookings.filter(
        booking =>
          booking.status ===
          "Delivered"
      ).length;

      const active =
  bookings.filter(
    booking =>
      booking.status !==
        "Delivered" &&
      booking.status !==
        "Cancelled"
  ).length;

    document
      .getElementById(
        "pendingBookings"
      )
      .textContent =
      pending;

    document
      .getElementById(
        "completedBookings"
      )
      .textContent =
      completed;

      document
  .getElementById(
    "activeBookings"
  )
  .textContent =
  active;

loadAdminLiveMap(
  filteredBookings
);

    if (
      filteredBookings.length === 0
    ) {

      container.innerHTML =
        "<p>No bookings found.</p>";

      return;
    }

    container.innerHTML =
      filteredBookings.map(
        booking => {

          const bookingId =
            escapeHtml(
              booking.bookingId
            );

          const assignedRider =
            booking.assignedRider
              ? escapeHtml(
                  booking.assignedRider
                )
              : "Not Assigned";

              const deliveryDistanceKm =
  booking.deliveryDistanceKm !== null &&
  booking.deliveryDistanceKm !== undefined
    ? Number(
        booking.deliveryDistanceKm
      )
    : null;

const routeDurationMinutes =
  booking.routeDurationMinutes !== null &&
  booking.routeDurationMinutes !== undefined
    ? Number(
        booking.routeDurationMinutes
      )
    : null;

const customerFare =
  booking.customerFare !== null &&
  booking.customerFare !== undefined
    ? Number(
        booking.customerFare
      )
    : null;

const riderEarning =
  booking.riderEarning !== null &&
  booking.riderEarning !== undefined
    ? Number(
        booking.riderEarning
      )
    : null;

const platformEarning =
  booking.platformEarning !== null &&
  booking.platformEarning !== undefined
    ? Number(
        booking.platformEarning
      )
    : null;

const bookingTime =
  booking.createdAt
    ? new Date(
        booking.createdAt
      ).toLocaleString(
        "en-IN"
      )
    : "Not available";

          return `

            <div class="booking">

              <div class="booking-header">

  <div>

    <h3>
      ${bookingId}
    </h3>

    <small>
      DDN Delivery Booking
    </small>

  </div>

  <span class="status">
    ${escapeHtml(
      booking.status
    )}
  </span>

</div>

              <p>
                <strong>
                  Customer:
                </strong>

                ${escapeHtml(
                  booking.customerName
                )}
              </p>

              <p>
                <strong>
                  Mobile:
                </strong>

                ${escapeHtml(
                  booking.mobileNumber
                )}
              </p>

              <p>
                <strong>
                  Pickup:
                </strong>

                ${escapeHtml(
                  booking.pickupLocation
                )}
              </p>

              <p>
                <strong>
                  Delivery:
                </strong>

                ${escapeHtml(
                  booking.deliveryLocation
                )}
              </p>

              <p>
  <strong>
    Road Distance:
  </strong>

  ${
    deliveryDistanceKm !== null
      ? `${escapeHtml(
          deliveryDistanceKm
        )} km`
      : "Not available"
  }
</p>

<p>
  <strong>
    Estimated Travel Time:
  </strong>

  ${
    routeDurationMinutes !== null
      ? `${escapeHtml(
          routeDurationMinutes
        )} minutes`
      : "Not available"
  }
</p>

<p>
  <strong>
    Customer Fare:
  </strong>

  ${
    customerFare !== null
      ? `₹${escapeHtml(
          customerFare
        )}`
      : "Not available"
  }
</p>

<p>
  <strong>
    Rider Earning:
  </strong>

  ${
    riderEarning !== null
      ? `₹${escapeHtml(
          riderEarning
        )}`
      : "Not available"
  }
</p>

<p>
  <strong>
    Platform Earning:
  </strong>

  ${
    platformEarning !== null
      ? `₹${escapeHtml(
          platformEarning
        )}`
      : "Not available"
  }
</p>

<p>
  <strong>
    Booking Time:
  </strong>

  ${escapeHtml(
    bookingTime
  )}
</p>

              
              <p>
                <strong>
                  Assigned Rider:
                </strong>

                <span>
                  ${assignedRider}
                </span>
              </p>

              <hr>

              <label
                for="rider-${bookingId}"
              >
                <strong>
                  Assign Rider:
                </strong>
              </label>

              <input
                type="text"
                id="rider-${bookingId}"
                placeholder="Enter rider username"
                value="${
                  booking.assignedRider
                    ? escapeHtml(
                        booking.assignedRider
                      )
                    : ""
                }"
${
  booking.adminAccepted
    ? ""
    : "disabled"
}

              >

              ${
  booking.status === "Pending" &&
  !booking.adminAccepted
    ? `
      <button
        type="button"
        class="accept-order-button"
        onclick="
          acceptOrder(
            '${bookingId}'
          )
        "
      >
        🟢 Accept Order
      </button>

      <br><br>
    `
    : `
      <p>
        <strong>
          Admin Acceptance:
        </strong>

        <span class="status">
          ${
            booking.adminAccepted
              ? "Accepted"
              : "Not Required"
          }
        </span>
      </p>
    `
}

             <button
  type="button"
  ${
    booking.adminAccepted
      ? ""
      : "disabled"
  }
  onclick="
    assignRider(
      '${bookingId}'
    )
  "
>
  ${
    booking.adminAccepted
      ? "Assign Rider"
      : "Accept Order First"
  }
</button>

              <br><br>

              <label
                for="status-${bookingId}"
              >
                <strong>
                  Update Status:
                </strong>
              </label>

              <select
                id="status-${bookingId}"
              >

                <option
                  value="Pending"
                  ${
                    booking.status ===
                    "Pending"
                      ? "selected"
                      : ""
                  }
                >
                  Pending
                </option>

                <option
                  value="Assigned"
                  ${
                    booking.status ===
                    "Assigned"
                      ? "selected"
                      : ""
                  }
                >
                  Assigned
                </option>

                <option
                  value="Picked Up"
                  ${
                    booking.status ===
                    "Picked Up"
                      ? "selected"
                      : ""
                  }
                >
                  Picked Up
                </option>

                <option
                  value="Out for Delivery"
                  ${
                    booking.status ===
                    "Out for Delivery"
                      ? "selected"
                      : ""
                  }
                >
                  Out for Delivery
                </option>

                <option
                  value="Delivered"
                  ${
                    booking.status ===
                    "Delivered"
                      ? "selected"
                      : ""
                  }
                >
                  Delivered
                </option>

                <option
                  value="Cancelled"
                  ${
                    booking.status ===
                    "Cancelled"
                      ? "selected"
                      : ""
                  }
                >
                  Cancelled
                </option>

              </select>

              <button
                type="button"
                onclick="
                  updateStatus(
                    '${bookingId}'
                  )
                "
              >
                Update Status
              </button>

            </div>

          `;

        }

      ).join("");

  } catch (error) {

    console.error(error);

    container.innerHTML = `
      <p>
        ${
          escapeHtml(
            error.message ||
            "Unable to connect to DDN backend."
          )
        }
      </p>
    `;

  }

}

// ===============================
// START AUTO REFRESH
// ===============================

function startAutoRefresh() {

  console.log(
    "Auto refresh disabled - using Socket.IO"
  );

}

// ===============================
// ACCEPT ORDER
// ===============================

async function acceptOrder(
  bookingId
) {

  const token =
    getAdminToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  try {

    const response =
      await fetch(
        `${API_URL}/${encodeURIComponent(
          bookingId
        )}/admin-accept`,
        {
          method: "PATCH",

          headers: {
            "Authorization":
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          }
        }
      );

    const data =
      await response.json();

    if (
      handleAuthError(
        response,
        data
      )
    ) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to accept order"
      );
    }

    stopAdminAlarm();

    await loadBookings();

  } catch (error) {

    console.error(
      "Accept order error:",
      error
    );

    alert(
      error.message ||
      "Unable to accept order."
    );

  }

}

// ===============================
// ASSIGN RIDER
// ===============================

async function assignRider(
  bookingId
) {

  const token =
    getAdminToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  const riderInput =
    document.getElementById(
      `rider-${bookingId}`
    );

  const rider =
    riderInput.value.trim();

  if (!rider) {

    alert(
      "Please enter rider username."
    );

    return;
  }

  const button =
    riderInput.nextElementSibling;

  if (button) {

    button.disabled = true;

    button.textContent =
      "Assigning...";

  }

  try {

    const response =
      await fetch(
        `${API_URL}/${bookingId}/assign`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body: JSON.stringify({
            rider
          })
        }
      );

    const data =
      await response.json();

    if (
      handleAuthError(
        response,
        data
      )
    ) {
      return;
    }

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Rider assignment failed"
      );

    }

    alert(
      `Rider "${rider}" assigned successfully!`
    );

    stopAdminAlarm();

    await loadBookings();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to assign rider."
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Assign Rider";

    }

  }

}


// ===============================
// UPDATE BOOKING STATUS
// ===============================

async function updateStatus(
  bookingId
) {

  const token =
    getAdminToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  const select =
    document.getElementById(
      `status-${bookingId}`
    );

  const newStatus =
    select.value;

  select.disabled = true;

  try {

    const response =
      await fetch(
        `${API_URL}/${bookingId}/status`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body: JSON.stringify({
            status: newStatus
          })
        }
      );

    const data =
      await response.json();

    if (
      handleAuthError(
        response,
        data
      )
    ) {
      return;
    }

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Status update failed"
      );

    }

    alert(
      "Booking status updated successfully!"
    );

    await loadBookings();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to update booking status."
    );

  } finally {

    select.disabled = false;

  }

}

// ===============================
// ENABLE ALERTS ON FIRST INTERACTION
// ===============================

async function enableAlertsOnFirstInteraction() {

console.log("First interaction detected");

  if (adminAlertEnabled) {
    return;
  }

  await enableAdminAlerts();

  if (
    "Notification" in window &&
    Notification.permission ===
      "default"
  ) {
    await Notification.requestPermission();
  }
}

document.addEventListener(
  "pointerdown",
  enableAlertsOnFirstInteraction,
  {
    once: true
  }
);

document.addEventListener(
  "keydown",
  enableAlertsOnFirstInteraction,
  {
    once: true
  }
);
