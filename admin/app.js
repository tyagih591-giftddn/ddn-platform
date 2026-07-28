const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";

  // ===============================
// ADMIN LIVE MAP
// ===============================

let adminMap = null;

let adminMarkers = [];

let adminRoutes = [];

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
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
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
        Number(
          tracking.pickupLatitude
        );

      const pickupLongitude =
        Number(
          tracking.pickupLongitude
        );

      const deliveryLatitude =
        Number(
          tracking.deliveryLatitude
        );

      const deliveryLongitude =
        Number(
          tracking.deliveryLongitude
        );

      const riderLatitude =
        Number(
          tracking.riderLatitude
        );

      const riderLongitude =
        Number(
          tracking.riderLongitude
        );

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
          deliveryLatitude,
          deliveryLongitude
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

  clearAdminLogin();

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
  bookings
);

    if (
      bookings.length === 0
    ) {

      container.innerHTML =
        "<p>No bookings found.</p>";

      return;
    }

    container.innerHTML =
      bookings.map(
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

          return `

            <div class="booking">

              <h3>
                ${bookingId}
              </h3>

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
                  Current Status:
                </strong>

                <span class="status">
                  ${escapeHtml(
                    booking.status
                  )}
                </span>
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
              >

              <button
                type="button"
                onclick="
                  assignRider(
                    '${bookingId}'
                  )
                "
              >
                Assign Rider
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
