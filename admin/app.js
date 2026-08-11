const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";

  const RIDERS_API =
  "https://ddn-platform.onrender.com/api/admin/riders";

const RESET_RIDER_PASSWORD_API =
  "https://ddn-platform.onrender.com/api/auth/reset-rider-password";

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
        "ðŸšš New DDN Order",
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
                  "ðŸ“",
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
                  "ðŸ›µ",
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
                  "ðŸ",
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

   loadRiders();

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
// RIDER MANAGEMENT ACTIONS
// ===============================

function renderRiderActionButtons(rider) {

  const username =
    escapeHtml(
      rider.username || ""
    );

  const applicationStatus =
    String(
      rider.applicationStatus || ""
    ).toLowerCase();

  const verificationStatus =
    String(
      rider.verificationStatus || ""
    ).toLowerCase();

  const accountStatus =
    String(
      rider.accountStatus || ""
    ).toLowerCase();

  const buttons = [];

  if (
    applicationStatus === "pending" ||
    applicationStatus === "correction_required" ||
    verificationStatus === "pending" ||
    verificationStatus === "correction_required"
  ) {

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-approve-button"
        onclick="approveRider('${username}')"
      >
        Approve
      </button>
    `);

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-correction-button"
        onclick="requestRiderCorrection('${username}')"
      >
        Request Correction
      </button>
    `);

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-reject-button"
        onclick="rejectRider('${username}')"
      >
        Reject
      </button>
    `);

  }

  if (
    accountStatus === "active"
  ) {

    buttons.push(`
      <button
        type="button"
        class="rider-action-button"
        onclick="setRiderActive('${username}', false)"
      >
        Deactivate
      </button>
    `);

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-block-button"
        onclick="blockRider('${username}')"
      >
        Block
      </button>
    `);

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-resign-button"
        onclick="resignRider('${username}')"
      >
        Mark Resigned
      </button>
    `);

  }

  if (
    accountStatus === "inactive" &&
    applicationStatus === "approved" &&
    verificationStatus === "verified"
  ) {

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-approve-button"
        onclick="setRiderActive('${username}', true)"
      >
        Activate
      </button>
    `);

  }

  if (
    accountStatus === "blocked"
  ) {

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-approve-button"
        onclick="unblockRider('${username}')"
      >
        Unblock
      </button>
    `);

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-resign-button"
        onclick="resignRider('${username}')"
      >
        Mark Resigned
      </button>
    `);

  }

  if (
    accountStatus !== "resigned" &&
    applicationStatus === "approved"
  ) {

    buttons.push(`
      <button
        type="button"
        class="rider-action-button rider-password-button"
        onclick="resetRiderPassword('${username}')"
      >
        Reset Password
      </button>
    `);

  }

  if (buttons.length === 0) {
    return `
      <p>
        No management actions available
        for this rider.
      </p>
    `;
  }

  return `
    <div class="rider-action-buttons">
      ${buttons.join("")}
    </div>
  `;
}


async function callRiderManagementApi(
  url,
  options = {}
) {

  const token =
    getAdminToken();

  if (!token) {
    showLoginScreen(
      "Please login again."
    );

    return null;
  }

  const response =
    await fetch(
      url,
      {
        ...options,

        headers: {
          "Authorization":
            `Bearer ${token}`,

          "Content-Type":
            "application/json",

          ...(options.headers || {})
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
    return null;
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Rider action failed"
    );
  }

  return data;
}


async function approveRider(username) {

  if (
    !window.confirm(
      `Approve rider "${username}"?`
    )
  ) {
    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/approve`,
      {
        method: "PATCH"
      }
    );

    alert(
      "Rider approved successfully."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to approve rider."
    );

  }

}


async function rejectRider(username) {

  const rejectionReason =
    window.prompt(
      `Enter rejection reason for "${username}":`
    );

  if (
    rejectionReason === null
  ) {
    return;
  }

  const reason =
    rejectionReason.trim();

  if (!reason) {
    alert(
      "Rejection reason is required."
    );

    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/reject`,
      {
        method: "PATCH",

        body: JSON.stringify({
          rejectionReason: reason
        })
      }
    );

    alert(
      "Rider application rejected."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to reject rider."
    );

  }

}


async function requestRiderCorrection(
  username
) {

  const correctionNotes =
    window.prompt(
      `Enter correction notes for "${username}":`
    );

  if (
    correctionNotes === null
  ) {
    return;
  }

  const notes =
    correctionNotes.trim();

  if (!notes) {
    alert(
      "Correction notes are required."
    );

    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/request-correction`,
      {
        method: "PATCH",

        body: JSON.stringify({
          correctionNotes: notes
        })
      }
    );

    alert(
      "Correction request sent."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to request correction."
    );

  }

}


async function setRiderActive(
  username,
  isActive
) {

  const action =
    isActive
      ? "activate"
      : "deactivate";

  if (
    !window.confirm(
      `${action} rider "${username}"?`
    )
  ) {
    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/status`,
      {
        method: "PATCH",

        body: JSON.stringify({
          isActive
        })
      }
    );

    alert(
      isActive
        ? "Rider activated successfully."
        : "Rider deactivated successfully."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      `Unable to ${action} rider.`
    );

  }

}


async function blockRider(username) {

  const blockedReason =
    window.prompt(
      `Enter block reason for "${username}":`
    );

  if (
    blockedReason === null
  ) {
    return;
  }

  const reason =
    blockedReason.trim();

  if (!reason) {
    alert(
      "Block reason is required."
    );

    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/block`,
      {
        method: "PATCH",

        body: JSON.stringify({
          blockedReason: reason
        })
      }
    );

    alert(
      "Rider blocked successfully."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to block rider."
    );

  }

}


async function unblockRider(username) {

  if (
    !window.confirm(
      `Unblock rider "${username}"?`
    )
  ) {
    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/unblock`,
      {
        method: "PATCH"
      }
    );

    alert(
      "Rider unblocked successfully."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to unblock rider."
    );

  }

}


async function resignRider(username) {

  const resignationReason =
    window.prompt(
      `Enter resignation reason for "${username}":`
    );

  if (
    resignationReason === null
  ) {
    return;
  }

  const reason =
    resignationReason.trim();

  if (!reason) {
    alert(
      "Resignation reason is required."
    );

    return;
  }

  if (
    !window.confirm(
      `Mark "${username}" as resigned?`
    )
  ) {
    return;
  }

  try {

    await callRiderManagementApi(
      `${RIDERS_API}/${encodeURIComponent(
        username
      )}/resign`,
      {
        method: "PATCH",

        body: JSON.stringify({
          resignationReason: reason
        })
      }
    );

    alert(
      "Rider marked as resigned."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to mark rider as resigned."
    );

  }

}


async function resetRiderPassword(
  username
) {

  const newPassword =
    window.prompt(
      `Enter new password for "${username}":`
    );

  if (newPassword === null) {
    return;
  }

  if (newPassword.length < 8) {

    alert(
      "Password must be at least 8 characters."
    );

    return;
  }

  const confirmPassword =
    window.prompt(
      "Confirm the new password:"
    );

  if (confirmPassword === null) {
    return;
  }

  if (
    newPassword !==
    confirmPassword
  ) {

    alert(
      "Passwords do not match."
    );

    return;
  }

  try {

    await callRiderManagementApi(
      RESET_RIDER_PASSWORD_API,
      {
        method: "POST",

        body: JSON.stringify({
          username,
          newPassword,
          confirmPassword
        })
      }
    );

    alert(
      "Rider password reset successfully."
    );

    await loadRiders();

  } catch (error) {

    alert(
      error.message ||
      "Unable to reset rider password."
    );

  }

}

// ===============================
// LOAD RIDERS
// ===============================

async function loadRiders() {

  const container =
    document.getElementById(
      "ridersContainer"
    );

  const messageElement =
    document.getElementById(
      "riderManagementMessage"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    "<p>Loading riders...</p>";

  if (messageElement) {
    messageElement.textContent =
      "Loading riders...";
  }

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
        RIDERS_API,
        {
          method: "GET",

          headers: {
            "Authorization":
              `Bearer ${token}`
          },

          cache: "no-store"
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
        "Unable to load riders"
      );
    }

    const riders =
      Array.isArray(data.riders)
        ? data.riders
        : [];

    const totalRidersElement =
      document.getElementById(
        "totalRiders"
      );

    const pendingRidersElement =
      document.getElementById(
        "pendingRiders"
      );

    const activeRidersElement =
      document.getElementById(
        "activeRiders"
      );

    const blockedRidersElement =
      document.getElementById(
        "blockedRiders"
      );

    const pendingRiders =
      riders.filter(
        rider =>
          rider.applicationStatus ===
            "pending" ||
          rider.accountStatus ===
            "pending"
      ).length;

    const activeRiders =
      riders.filter(
        rider =>
          rider.accountStatus ===
            "active" &&
          rider.isActive === true
      ).length;

    const blockedRiders =
      riders.filter(
        rider =>
          rider.accountStatus ===
            "blocked"
      ).length;

    if (totalRidersElement) {
      totalRidersElement.textContent =
        riders.length;
    }

    if (pendingRidersElement) {
      pendingRidersElement.textContent =
        pendingRiders;
    }

    if (activeRidersElement) {
      activeRidersElement.textContent =
        activeRiders;
    }

    if (blockedRidersElement) {
      blockedRidersElement.textContent =
        blockedRiders;
    }

    if (messageElement) {
      messageElement.textContent =
        `${riders.length} rider${
          riders.length === 1
            ? ""
            : "s"
        } found`;
    }

    if (riders.length === 0) {

      container.innerHTML =
        "<p>No riders found.</p>";

      return;
    }

    container.innerHTML =
      riders.map(
        rider => {

          const username =
            escapeHtml(
              rider.username ||
              ""
            );

          const riderCode =
            escapeHtml(
              rider.riderCode ||
              "Not assigned"
            );

          const fullName =
            escapeHtml(
              rider.fullName ||
              "Not available"
            );

          const mobileNumber =
            escapeHtml(
              rider.mobileNumber ||
              "Not available"
            );

          const email =
            escapeHtml(
              rider.email ||
              "Not available"
            );

          const workingArea =
            escapeHtml(
              rider.workingArea ||
              "Not available"
            );

          const vehicleType =
            escapeHtml(
              rider.vehicleType ||
              "Not available"
            );

          const vehicleNumber =
            escapeHtml(
              rider.vehicleNumber ||
              "Not available"
            );

          const verificationStatus =
            escapeHtml(
              rider.verificationStatus ||
              "pending"
            );

          const applicationStatus =
            escapeHtml(
              rider.applicationStatus ||
              "pending"
            );

          const accountStatus =
            escapeHtml(
              rider.accountStatus ||
              "pending"
            );

          const availabilityStatus =
            escapeHtml(
              rider.availabilityStatus ||
              "offline"
            );

          const submittedAt =
            rider.applicationSubmittedAt
              ? new Date(
                  rider.applicationSubmittedAt
                ).toLocaleString(
                  "en-IN"
                )
              : "Not available";

          return `
            <div class="rider-management-card">

              <div class="rider-management-card-header">

                <div>
                  <h3>
                    ${fullName}
                  </h3>

                  <small>
                    ${riderCode}
                    Â·
                    @${username}
                  </small>
                </div>

                <span class="rider-account-status">
                  ${accountStatus}
                </span>

              </div>

              <div class="rider-management-details">

                <p>
                  <strong>Mobile:</strong>
                  ${mobileNumber}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${email}
                </p>

                <p>
                  <strong>Working Area:</strong>
                  ${workingArea}
                </p>

                <p>
                  <strong>Vehicle:</strong>
                  ${vehicleType}
                </p>

                <p>
                  <strong>Vehicle Number:</strong>
                  ${vehicleNumber}
                </p>

                <p>
                  <strong>Verification:</strong>
                  ${verificationStatus}
                </p>

                <p>
                  <strong>Application:</strong>
                  ${applicationStatus}
                </p>

                <p>
                  <strong>Availability:</strong>
                  ${availabilityStatus}
                </p>

                <p>
                  <strong>Application Submitted:</strong>
                  ${escapeHtml(
                    submittedAt
                  )}
                </p>

              </div>

              <div
  class="rider-management-actions"
  data-rider-username="${username}"
>
  ${renderRiderActionButtons(rider)}
</div>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    console.error(
      "Load riders error:",
      error
    );

    if (messageElement) {
      messageElement.textContent =
        "Unable to load riders.";
    }

    container.innerHTML = `
      <p>
        ${escapeHtml(
          error.message ||
          "Unable to connect to DDN backend."
        )}
      </p>
    `;

  }

}

const refreshRidersButton =
  document.getElementById(
    "refreshRidersButton"
  );

if (refreshRidersButton) {

  refreshRidersButton.addEventListener(
    "click",
    async () => {

      refreshRidersButton.disabled =
        true;

      refreshRidersButton.textContent =
        "Refreshing...";

      try {

        await loadRiders();

      } finally {

        refreshRidersButton.disabled =
          false;

        refreshRidersButton.textContent =
          "Refresh Riders";

      }

    }
    );

}

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

<div class="booking-details-grid">

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
      ? `â‚¹${escapeHtml(
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
      ? `â‚¹${escapeHtml(
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
      ? `â‚¹${escapeHtml(
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

              </div>

              <hr>

              <div class="booking-actions-final">

  <div class="booking-action-panel">

    <div class="booking-action-panel-heading">

      <div>

        <h4>
          Admin Acceptance
        </h4>

        <p>
          Confirm the booking before rider assignment.
        </p>

      </div>

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
              Accept Order
            </button>
          `
          : `
            <span class="status">
              ${
                booking.adminAccepted
                  ? "Accepted"
                  : "Not Required"
              }
            </span>
          `
      }

    </div>

  </div>


  <div class="booking-action-panel">

    <label
      for="rider-${bookingId}"
    >
      Assign Rider
    </label>

    <div class="booking-action-row">

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

      <button
        type="button"
        class="assign-rider-button"
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

    </div>

  </div>


  <div class="booking-action-panel">

    <label
      for="status-${bookingId}"
    >
      Update Status
    </label>

    <div class="booking-action-row">

      <select
        id="status-${bookingId}"
      >

        <option
          value="Pending"
          ${
            booking.status === "Pending"
              ? "selected"
              : ""
          }
        >
          Pending
        </option>

        <option
          value="Assigned"
          ${
            booking.status === "Assigned"
              ? "selected"
              : ""
          }
        >
          Assigned
        </option>

        <option
          value="Picked Up"
          ${
            booking.status === "Picked Up"
              ? "selected"
              : ""
          }
        >
          Picked Up
        </option>

        <option
          value="Out for Delivery"
          ${
            booking.status === "Out for Delivery"
              ? "selected"
              : ""
          }
        >
          Out for Delivery
        </option>

        <option
          value="Delivered"
          ${
            booking.status === "Delivered"
              ? "selected"
              : ""
          }
        >
          Delivered
        </option>

        <option
          value="Cancelled"
          ${
            booking.status === "Cancelled"
              ? "selected"
              : ""
          }
        >
          Cancelled
        </option>

      </select>

      <button
        type="button"
        class="update-status-button"
        onclick="
          updateStatus(
            '${bookingId}'
          )
        "
      >
        Update Status
      </button>

    </div>

  </div>

</div>

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
