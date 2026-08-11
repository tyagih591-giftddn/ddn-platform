const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";

  const CHANGE_RIDER_PASSWORD_API =
  "https://ddn-platform.onrender.com/api/auth/change-rider-password";

const RIDER_LOCATION_API =
  "https://ddn-platform.onrender.com/api/rider/location";

  const SOCKET_URL =
  "https://ddn-platform.onrender.com";

let riderSocket = null;

let riderLocationInterval = null;

let riderAlertAudio = null;
let riderAlertEnabled = false;

// ===============================
// GOOGLE ROUTES
// ===============================

let RouteClass = null;

async function enableRiderAlerts() {

  console.log(
    "enableRiderAlerts() called"
  );

  if (!riderAlertAudio) {

    riderAlertAudio =
      new Audio(
        "sounds/new-order.mp3"
      );

    riderAlertAudio.loop = true;
    riderAlertAudio.volume = 1;
    riderAlertAudio.preload = "auto";

  }

  riderAlertEnabled = true;

  localStorage.setItem(
    "ddnRiderAlertsEnabled",
    "true"
  );

  console.log(
    "Rider alerts enabled"
  );

  if (
    "Notification" in window &&
    Notification.permission ===
      "default"
  ) {
    try {
      await Notification
        .requestPermission();
    } catch (error) {
      console.warn(error);
    }
  }

}

function startRiderAlarm() {

  console.log(
    "startRiderAlarm() called"
  );

  if (
    !riderAlertEnabled ||
    !riderAlertAudio
  ) {
    console.warn(
      "Rider alarm not ready",
      {
        riderAlertEnabled,
        hasAudio:
          Boolean(
            riderAlertAudio
          )
      }
    );

    return;
  }

  stopRiderAlarm();

  riderAlertAudio.load();
  riderAlertAudio.currentTime = 0;

  riderAlertAudio
    .play()
    .then(() => {

      console.log(
        "Playing rider alarm"
      );

    })
    .catch(error => {

      console.error(
        "Unable to play rider alarm:",
        error
      );

    });

}

function stopRiderAlarm() {
  if (!riderAlertAudio) {
    return;
  }

  riderAlertAudio.pause();
  riderAlertAudio.currentTime = 0;
}

function connectRiderSocket() {
  if (
    riderSocket &&
    riderSocket.connected
  ) {
    return;
  }

  if (typeof io === "undefined") {
    console.error(
      "Socket.IO client is not loaded"
    );

    return;
  }

  riderSocket =
    io(SOCKET_URL, {
      transports: [
        "websocket",
        "polling"
      ]
    });

  riderSocket.on(
    "connect",
    () => {
      console.log(
        "Rider socket connected:",
        riderSocket.id
      );
    }
  );

riderSocket.on(
  "rider-assigned",
  async booking => {

    const riderUsername =
      localStorage.getItem(
        "ddnRiderUsername"
      );

    if (
      !riderUsername ||
      booking.assignedRider !==
        riderUsername
    ) {
      return;
    }

    console.log(
      "Realtime rider assignment:",
      booking
    );

    startRiderAlarm();

    if (
      "Notification" in window &&
      Notification.permission ===
        "granted"
    ) {
      new Notification(
        "🚴 New DDN Delivery Assigned",
        {
          body:
            `${booking.bookingId} - ` +
            `${booking.pickupLocation} → ` +
            `${booking.deliveryLocation}`,

          tag:
            String(
              booking.bookingId
            )
        }
      );
    }

    try {

      await loadDeliveries();

    } catch (error) {

      console.error(
        "Unable to refresh rider deliveries after assignment:",
        error
      );

    }

  }
);


riderSocket.on(
  "booking-status-updated",
  async booking => {

    const riderUsername =
      localStorage.getItem(
        "ddnRiderUsername"
      );

    if (
      !riderUsername ||
      booking.assignedRider !==
        riderUsername
    ) {
      return;
    }

    console.log(
      "Realtime rider status update:",
      booking
    );

    await loadDeliveries();

  }
);

  riderSocket.on(
    "disconnect",
    reason => {
      console.warn(
        "Rider socket disconnected:",
        reason
      );
    }
  );

  riderSocket.on(
    "connect_error",
    error => {
      console.error(
        "Rider socket connection error:",
        error.message
      );
    }
  );
}

// ===============================
// GET RIDER TOKEN
// ===============================

function getRiderToken() {

  return localStorage.getItem(
    "ddnRiderToken"
  );

}


// ===============================
// CLEAR RIDER LOGIN
// ===============================

function clearRiderLogin() {

  localStorage.removeItem(
    "ddnRiderLoggedIn"
  );

  localStorage.removeItem(
    "ddnRiderUsername"
  );

  localStorage.removeItem(
    "ddnRiderToken"
  );

}


// ===============================
// SHOW LOGIN SCREEN
// ===============================

function showLoginScreen(
  message = ""
) {

  document
    .getElementById(
      "dashboardSection"
    )
    .style.display =
    "none";

    document
  .getElementById(
    "passwordChangeSection"
  )
  .style.display =
  "none";



  document
    .getElementById(
      "loginSection"
    )
    .style.display =
    "block";

  document
    .getElementById(
      "loginForm"
    )
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

    clearRiderLogin();

    showLoginScreen(
      data.message ||
      "Your login session has expired. Please login again."
    );

    return true;

  }

  return false;

}


// ===============================
// RIDER LOGIN
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
          "riderUsername"
        )
        .value
        .trim();

    const password =
      document
        .getElementById(
          "riderPassword"
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
              role: "rider"
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
        "ddnRiderLoggedIn",
        "true"
      );

      localStorage.setItem(
        "ddnRiderUsername",
        data.username || username
      );

      localStorage.setItem(
        "ddnRiderToken",
        data.token
      );

      loginMessage.textContent =
  "";

if (
  data.passwordResetRequired === true
) {

  localStorage.setItem(
    "ddnRiderPasswordResetRequired",
    "true"
  );

  showPasswordChangeScreen();

} else {

  localStorage.removeItem(
    "ddnRiderPasswordResetRequired"
  );

  showDashboard();

}

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

async function showDashboard() {

  const token =
    getRiderToken();

  const riderUsername =
    localStorage.getItem(
      "ddnRiderUsername"
    );

  if (
    !token ||
    !riderUsername
  ) {

    showLoginScreen(
      "Please login again."
    );

    return;

  }

  document
    .getElementById(
      "loginSection"
    )
    .style.display =
    "none";

  document
    .getElementById(
      "dashboardSection"
    )
    .style.display =
    "block";

  loadDeliveries();

await enableRiderAlerts();

connectRiderSocket();

startLiveLocationTracking();

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

  stopLiveLocationTracking();

  if (
    riderSocket &&
    riderSocket.connected
  ) {
    riderSocket.disconnect();
  }

  clearRiderLogin();

  showLoginScreen();

}
  );

  // ===============================
// SHOW PASSWORD CHANGE SCREEN
// ===============================

function showPasswordChangeScreen() {

  document
    .getElementById(
      "loginSection"
    )
    .style.display =
    "none";

  document
    .getElementById(
      "dashboardSection"
    )
    .style.display =
    "none";

  document
    .getElementById(
      "passwordChangeSection"
    )
    .style.display =
    "block";

  const form =
    document.getElementById(
      "passwordChangeForm"
    );

  if (form) {
    form.reset();
  }

  const message =
    document.getElementById(
      "passwordChangeMessage"
    );

  if (message) {
    message.textContent = "";
  }

}

// ===============================
// RIDER CHANGE PASSWORD
// ===============================

const passwordChangeForm =
  document.getElementById(
    "passwordChangeForm"
  );

if (passwordChangeForm) {

  passwordChangeForm.addEventListener(
    "submit",
    async function (e) {

      e.preventDefault();

      const currentPassword =
        document
          .getElementById(
            "currentRiderPassword"
          )
          .value;

      const newPassword =
        document
          .getElementById(
            "newRiderPassword"
          )
          .value;

      const confirmPassword =
        document
          .getElementById(
            "confirmRiderPassword"
          )
          .value;

      const messageElement =
        document.getElementById(
          "passwordChangeMessage"
        );

      if (
        newPassword.length < 8
      ) {
        messageElement.textContent =
          "New password must be at least 8 characters.";

        messageElement.style.color =
          "red";

        return;
      }

      if (
        newPassword !==
        confirmPassword
      ) {
        messageElement.textContent =
          "New password and confirm password do not match.";

        messageElement.style.color =
          "red";

        return;
      }

      const token =
        getRiderToken();

      if (!token) {

        clearRiderLogin();

        showLoginScreen(
          "Please login again."
        );

        return;
      }

      messageElement.textContent =
        "Changing password...";

      messageElement.style.color =
        "#333";

      try {

        const response =
          await fetch(
            CHANGE_RIDER_PASSWORD_API,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "Authorization":
                  `Bearer ${token}`
              },

              body: JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword
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
            "Unable to change password."
          );
        }

        localStorage.removeItem(
          "ddnRiderPasswordResetRequired"
        );

        messageElement.textContent =
          "Password changed successfully.";

        messageElement.style.color =
          "green";

        document
          .getElementById(
            "passwordChangeSection"
          )
          .style.display =
          "none";

        await showDashboard();

      } catch (error) {

        console.error(
          "Rider password change error:",
          error
        );

        messageElement.textContent =
          error.message ||
          "Unable to change password.";

        messageElement.style.color =
          "red";

      }

    }
  );

}

// ===============================
// CHECK SAVED LOGIN
// ===============================

const savedLogin =
  localStorage.getItem(
    "ddnRiderLoggedIn"
  );

const savedRiderUsername =
  localStorage.getItem(
    "ddnRiderUsername"
  );

const savedRiderToken =
  getRiderToken();

if (
  savedLogin === "true" &&
  savedRiderUsername &&
  savedRiderToken
) {

  const passwordResetRequired =
    localStorage.getItem(
      "ddnRiderPasswordResetRequired"
    );

  if (
    passwordResetRequired ===
    "true"
  ) {

    showPasswordChangeScreen();

  } else {

    showDashboard();

  }

} else {

  clearRiderLogin();

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
// LOAD DELIVERIES
// ===============================

async function loadDeliveries() {

  const container =
    document.getElementById(
      "deliveriesContainer"
    );

  container.innerHTML =
    "<p>Loading deliveries...</p>";

  const riderUsername =
    localStorage.getItem(
      "ddnRiderUsername"
    );

  const token =
    getRiderToken();

  if (
    !riderUsername ||
    !token
  ) {

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
        "Unable to load deliveries"
      );

    }

    const bookings =
      data.bookings || [];

    const deliveries =
      bookings.filter(
        booking => {

          const belongsToRider =
            booking.assignedRider ===
            riderUsername;

          const activeStatuses = [
            "Assigned",
            "Accepted",
            "Picked Up",
            "Out for Delivery",
            "Reached Drop Location"
          ];

          const activeStatus =
            activeStatuses.includes(
              booking.status
            );

          return (
            belongsToRider &&
            activeStatus
          );

        }
      );

    if (
      deliveries.length === 0
    ) {

      container.innerHTML = `

        <p>
          No active deliveries assigned to
          <strong>
            ${escapeHtml(
              riderUsername
            )}
          </strong>.
        </p>

      `;

      return;

    }

    let riderCurrentLocation =
  null;

try {

  riderCurrentLocation =
    await getCurrentLocation();

} catch (locationError) {

  console.warn(
    "Unable to calculate live ETA because rider GPS is unavailable:",
    locationError
  );

}

const deliveriesWithRouteMetrics =
  await Promise.all(
    deliveries.map(
      async booking => {

        if (
          !riderCurrentLocation ||
          !RouteClass
        ) {
          return {
            ...booking,
            remainingRoute:
              null
          };
        }

        const headingToPickup =
          [
            "Assigned",
            "Accepted"
          ].includes(
            booking.status
          );

        const destinationLatitude =
          headingToPickup
            ? Number(
                booking
                  .customerPickupLatitude
              )
            : Number(
                booking
                  .customerDeliveryLatitude
              );

        const destinationLongitude =
          headingToPickup
            ? Number(
                booking
                  .customerPickupLongitude
              )
            : Number(
                booking
                  .customerDeliveryLongitude
              );

        if (
          !Number.isFinite(
            destinationLatitude
          ) ||
          !Number.isFinite(
            destinationLongitude
          )
        ) {
          return {
            ...booking,
            remainingRoute:
              null
          };
        }

        try {

          const routeMetrics =
            await calculateRiderRouteMetrics(
              {
                lat:
                  riderCurrentLocation
                    .latitude,

                lng:
                  riderCurrentLocation
                    .longitude
              },
              {
                lat:
                  destinationLatitude,

                lng:
                  destinationLongitude
              }
            );

          return {
            ...booking,

            remainingRoute: {
              destinationType:
                headingToPickup
                  ? "Pickup"
                  : "Delivery",

              distanceKm:
                routeMetrics
                  .distanceKm,

              durationMinutes:
                routeMetrics
                  .durationMinutes
            }
          };

        } catch (routeError) {

          console.error(
            `Remaining route calculation failed for ${booking.bookingId}:`,
            routeError
          );

          return {
            ...booking,
            remainingRoute:
              null
          };

        }

      }
    )
  );

    container.innerHTML =
  deliveriesWithRouteMetrics.map(
        booking => {

          const rawBookingId =
            String(
              booking.bookingId || ""
            );

          const bookingId =
            escapeHtml(
              rawBookingId
            );

          return `

  <div class="delivery">

    <div class="delivery-header">

      <div>
        <h3>
          ${bookingId}
        </h3>

        <span class="delivery-subtitle">
          DDN Delivery
        </span>
      </div>

      <span class="status">
        ${escapeHtml(
          booking.status
        )}
      </span>

    </div>


    <div class="delivery-info-grid">

      <div class="delivery-info-item">
        <span class="delivery-info-label">
          Assigned Rider
        </span>

        <strong>
          ${escapeHtml(
            booking.assignedRider
          )}
        </strong>
      </div>


      <div class="delivery-info-item">
        <span class="delivery-info-label">
          Customer
        </span>

        <strong>
          ${escapeHtml(
            booking.customerName
          )}
        </strong>
      </div>


      <div class="delivery-info-item">
        <span class="delivery-info-label">
          Mobile
        </span>

        <strong>
          ${escapeHtml(
            booking.mobileNumber
          )}
        </strong>
      </div>


      <div class="delivery-info-item rider-earning">
        <span class="delivery-info-label">
          Your Earning
        </span>

        <strong>
          ₹${
            booking.riderEarning !== null &&
            booking.riderEarning !== undefined
              ? escapeHtml(
                  booking.riderEarning
                )
              : "Not available"
          }
        </strong>
      </div>

    </div>


    <div class="delivery-route-card">

      <div class="delivery-route-point">

        <span class="route-marker pickup-marker">
          P
        </span>

        <div>
          <span class="delivery-info-label">
            Pickup
          </span>

          <p>
            ${escapeHtml(
              booking.pickupLocation
            )}
          </p>
        </div>

      </div>


      <div class="delivery-route-line"></div>


      <div class="delivery-route-point">

        <span class="route-marker delivery-marker">
          D
        </span>

        <div>
          <span class="delivery-info-label">
            Delivery
          </span>

          <p>
            ${escapeHtml(
              booking.deliveryLocation
            )}
          </p>
        </div>

      </div>

    </div>


    ${
      booking.remainingRoute
        ? `
          <div class="remaining-route">

            <div class="route-metric">

              <span>
                Current Destination
              </span>

              <strong>
                ${escapeHtml(
                  booking
                    .remainingRoute
                    .destinationType
                )}
              </strong>

            </div>


            <div class="route-metric">

              <span>
                Remaining Distance
              </span>

              <strong>
                ${escapeHtml(
                  booking
                    .remainingRoute
                    .distanceKm
                )} km
              </strong>

            </div>


            <div class="route-metric">

              <span>
                Live ETA
              </span>

              <strong>
                ${
                  booking
                    .remainingRoute
                    .durationMinutes !== null
                    ? `${escapeHtml(
                        booking
                          .remainingRoute
                          .durationMinutes
                      )} minutes`
                    : "Calculating..."
                }
              </strong>

            </div>

          </div>
        `
        : `
          <div class="remaining-route">

            <p>
              <strong>
                Live Route:
              </strong>

              GPS route information is temporarily unavailable.
            </p>

          </div>
        `
    }


    <div class="navigation-buttons">

      ${
        booking.status === "Accepted"
          ? `
            <button
              class="status-button"
              type="button"
              onclick="
                openNavigation(
                  '${escapeHtml(
                    booking.customerPickupLatitude
                  )}',
                  '${escapeHtml(
                    booking.customerPickupLongitude
                  )}',
                  '${escapeHtml(
                    booking.pickupLocation
                  )}'
                )
              "
            >
              📍 Navigate to Pickup
            </button>
          `
          : ""
      }


      ${
        booking.status === "Picked Up" ||
        booking.status === "Out for Delivery" ||
        booking.status === "Reached Drop Location"
          ? `
            <button
              class="status-button"
              type="button"
              onclick="
                openNavigation(
                  '${escapeHtml(
                    booking.customerDeliveryLatitude
                  )}',
                  '${escapeHtml(
                    booking.customerDeliveryLongitude
                  )}',
                  '${escapeHtml(
                    booking.deliveryLocation
                  )}'
                )
              "
            >
              📍 Navigate to Delivery
            </button>
          `
          : ""
      }

    </div>


    ${
      booking.status === "Assigned"
        ? `
          <div class="delivery-decision-actions">

            <button
              class="status-button accept-delivery-button"
              type="button"
              onclick="
                acceptDelivery(
                  '${rawBookingId}',
                  this
                )
              "
            >
              Accept Delivery
            </button>

            <button
              class="status-button reject-delivery-button"
              type="button"
              onclick="
                rejectDelivery(
                  '${rawBookingId}',
                  this
                )
              "
            >
              Reject Delivery
            </button>

          </div>
        `
        : ""
    }


    ${
      booking.status === "Accepted"
        ? `
          <div class="proof-section">

            <p>
              <strong>
                Pickup Proof Photo
              </strong>
            </p>

            <input
              id="pickup-photo-${rawBookingId}"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
            >

            <button
              class="status-button"
              type="button"
              onclick="
                uploadProof(
                  '${rawBookingId}',
                  'pickup',
                  this
                )
              "
            >
              Upload Pickup Photo
            </button>

            <p
              id="pickup-message-${rawBookingId}"
            ></p>

          </div>
        `
        : ""
    }


    ${
      booking.status === "Picked Up"
        ? `
          <button
            class="status-button"
            type="button"
            onclick="
              updateStatus(
                '${rawBookingId}',
                'Out for Delivery'
              )
            "
          >
            Out for Delivery
          </button>
        `
        : ""
    }


    ${
      booking.status === "Out for Delivery"
        ? `
          <button
            class="status-button"
            type="button"
            onclick="
              updateStatus(
                '${rawBookingId}',
                'Reached Drop Location'
              )
            "
          >
            Reached Drop Location
          </button>
        `
        : ""
    }


    ${
      booking.status === "Reached Drop Location"
        ? `
          <div class="proof-section">

            <p>
              <strong>
                Delivery Proof Photo
              </strong>
            </p>

            <input
              id="delivery-photo-${rawBookingId}"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
            >

            <button
              class="status-button"
              type="button"
              onclick="
                uploadProof(
                  '${rawBookingId}',
                  'delivery',
                  this
                )
              "
            >
              Upload Delivery Photo
            </button>

            <p
              id="delivery-message-${rawBookingId}"
            ></p>

          </div>
        `
        : ""
    }

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
// GET CURRENT GPS LOCATION
// ===============================

function getCurrentLocation() {

  return new Promise(
    (resolve, reject) => {

      if (!navigator.geolocation) {

        reject(
          new Error(
            "GPS location is not supported on this device."
          )
        );

        return;

      }

      navigator.geolocation.getCurrentPosition(

        position => {

          resolve({
            latitude:
              position.coords.latitude,

            longitude:
              position.coords.longitude
          });

        },

        error => {

          let message =
            "Unable to get GPS location.";

          if (error.code === 1) {

            message =
              "Location permission denied. Please allow location access.";

          } else if (
            error.code === 2
          ) {

            message =
              "Your current location is unavailable.";

          } else if (
            error.code === 3
          ) {

            message =
              "Location request timed out. Please try again.";

          }

          reject(
            new Error(message)
          );

        },

        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }

      );

    }
  );

}



// ===============================
// START LIVE RIDER LOCATION
// ===============================

let riderLocationRequestRunning =
  false;

async function sendRiderLocation() {

  if (riderLocationRequestRunning) {
    console.warn(
      "Previous rider location update is still running"
    );

    return;
  }

  const token =
    getRiderToken();

  if (!token) {
    return;
  }

  riderLocationRequestRunning =
    true;

  try {

    const location =
      await getCurrentLocation();

    const response =
      await fetch(
        RIDER_LOCATION_API,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body: JSON.stringify({
            latitude:
              location.latitude,

            longitude:
              location.longitude
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
      stopLiveLocationTracking();

      return;
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to update rider location"
      );
    }

    console.log(
      "Rider location updated:",
      data.location
    );

  } catch (error) {

    console.error(
      "Location Update Error:",
      error.message ||
      error
    );

  } finally {

    riderLocationRequestRunning =
      false;

  }

}

function startLiveLocationTracking() {

  stopLiveLocationTracking();

  sendRiderLocation();

  riderLocationInterval =
    setInterval(
      sendRiderLocation,
      15000
    );

  console.log(
    "Live rider location tracking started"
  );

}

function stopLiveLocationTracking() {

  if (riderLocationInterval) {

    clearInterval(
      riderLocationInterval
    );

    riderLocationInterval =
      null;

  }

  riderLocationRequestRunning =
    false;

}

// ===============================
// UPLOAD PICKUP OR DELIVERY PROOF
// ===============================

async function uploadProof(
  bookingId,
  proofType,
  actionButton = null
) {

  const token =
    getRiderToken();

  if (!token) {
    showLoginScreen(
      "Please login again."
    );

    return;
  }

  const isPickup =
    proofType === "pickup";

  const isDelivery =
    proofType === "delivery";

  if (
    !isPickup &&
    !isDelivery
  ) {
    alert(
      "Invalid proof type."
    );

    return;
  }

  const inputId =
    isPickup
      ? `pickup-photo-${bookingId}`
      : `delivery-photo-${bookingId}`;

  const messageId =
    isPickup
      ? `pickup-message-${bookingId}`
      : `delivery-message-${bookingId}`;

  const photoInput =
    document.getElementById(
      inputId
    );

  const messageElement =
    document.getElementById(
      messageId
    );

  if (
    !photoInput ||
    !photoInput.files ||
    photoInput.files.length === 0
  ) {
    alert(
      isPickup
        ? "Please select a pickup proof photo."
        : "Please select a delivery proof photo."
    );

    return;
  }

  const selectedFile =
    photoInput.files[0];

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (
    !allowedTypes.includes(
      selectedFile.type
    )
  ) {
    alert(
      "Only JPG, JPEG, PNG and WEBP images are allowed."
    );

    return;
  }

  const maximumFileSize =
    5 * 1024 * 1024;

  if (
    selectedFile.size >
    maximumFileSize
  ) {
    alert(
      "Proof photo must be 5 MB or smaller."
    );

    return;
  }

  const confirmed =
    confirm(
      isPickup
        ? "Upload pickup photo with your current GPS location?"
        : "Upload delivery photo with your current GPS location?"
    );

  if (!confirmed) {
    return;
  }

  if (actionButton) {
    actionButton.disabled = true;

    actionButton.textContent =
      isPickup
        ? "Uploading Pickup Proof..."
        : "Uploading Delivery Proof...";
  }

  photoInput.disabled = true;

  try {
    if (messageElement) {
      messageElement.textContent =
        "Getting current GPS location...";

      messageElement.style.color =
        "#333";
    }

    const location =
      await getCurrentLocation();

    if (messageElement) {
      messageElement.textContent =
        "Uploading proof photo...";
    }

    const formData =
      new FormData();

    formData.append(
      "proofPhoto",
      selectedFile
    );

    formData.append(
      "latitude",
      String(
        location.latitude
      )
    );

    formData.append(
      "longitude",
      String(
        location.longitude
      )
    );

    const routeName =
      isPickup
        ? "pickup-proof"
        : "delivery-proof";

    const response =
      await fetch(
        `${API_URL}/${encodeURIComponent(
          bookingId
        )}/${routeName}`,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${token}`
          },

          body:
            formData
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
        "Proof photo upload failed."
      );
    }

    if (messageElement) {
      messageElement.textContent =
        data.message ||
        "Proof photo uploaded successfully.";

      messageElement.style.color =
        "green";
    }

    photoInput.value = "";

    alert(
      data.message ||
      "Proof photo uploaded successfully!"
    );

    await loadDeliveries();

  } catch (error) {
    console.error(
      "Proof upload error:",
      error
    );

    if (messageElement) {
      messageElement.textContent =
        error.message ||
        "Unable to upload proof photo.";

      messageElement.style.color =
        "red";
    }

    alert(
      error.message ||
      "Unable to upload proof photo."
    );

    photoInput.disabled = false;

    if (actionButton) {
      actionButton.disabled = false;

      actionButton.textContent =
        isPickup
          ? "Upload Pickup Photo"
          : "Upload Delivery Photo";
    }
  }
}

// ===============================
// ACCEPT DELIVERY — RIDER
// ===============================

async function acceptDelivery(
  bookingId,
  actionButton = null
) {

  const token =
    getRiderToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  const confirmed =
    confirm(
      "Accept this delivery?"
    );

  if (!confirmed) {
    return;
  }

  if (actionButton) {

    actionButton.disabled = true;

    actionButton.textContent =
      "Accepting...";
  }

  try {

    const response =
      await fetch(
        `${API_URL}/${encodeURIComponent(
          bookingId
        )}/accept`,
        {
          method: "PATCH",

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
        "Unable to accept delivery."
      );
    }

    stopRiderAlarm();

    alert(
      data.message ||
      "Delivery accepted successfully!"
    );

    await loadDeliveries();

  } catch (error) {

    console.error(
      "Accept delivery error:",
      error
    );

    alert(
      error.message ||
      "Unable to accept delivery."
    );

    if (actionButton) {

      actionButton.disabled = false;

      actionButton.textContent =
        "Accept Delivery";
    }
  }
}

// ===============================
// REJECT DELIVERY — RIDER
// ===============================

async function rejectDelivery(
  bookingId,
  actionButton = null
) {

  const token =
    getRiderToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;
  }

  const confirmed =
    confirm(
      "Reject this delivery? It will be returned for reassignment."
    );

  if (!confirmed) {
    return;
  }

  if (actionButton) {

    actionButton.disabled = true;

    actionButton.textContent =
      "Rejecting...";
  }

  try {

    const response =
      await fetch(
        `${API_URL}/${encodeURIComponent(
          bookingId
        )}/reject`,
        {
          method: "PATCH",

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
        "Unable to reject delivery."
      );
    }

    stopRiderAlarm();

    alert(
      data.message ||
      "Delivery rejected successfully."
    );

    await loadDeliveries();

  } catch (error) {

    console.error(
      "Reject delivery error:",
      error
    );

    alert(
      error.message ||
      "Unable to reject delivery."
    );

    if (actionButton) {

      actionButton.disabled = false;

      actionButton.textContent =
        "Reject Delivery";
    }
  }
}

// ===============================
// UPDATE DELIVERY STATUS
// ===============================

async function updateStatus(
  bookingId,
  newStatus
) {

  const token =
    getRiderToken();

  if (!token) {

    showLoginScreen(
      "Please login again."
    );

    return;

  }

  const confirmed =
    confirm(
      `Change delivery status to "${newStatus}"?`
    );

  if (!confirmed) {

    return;

  }

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
      "Status updated successfully!"
    );

if (newStatus === "Accepted") {
  stopRiderAlarm();
}

    await loadDeliveries();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to update delivery status."
    );

  }

}

// ===============================
// GOOGLE MAPS NAVIGATION
// ===============================

function openNavigation(
  latitude,
  longitude,
  address
) {

  const numericLatitude =
    Number(
      latitude
    );

  const numericLongitude =
    Number(
      longitude
    );

  const hasValidCoordinates =
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
    );

  let navigationUrl = "";

  if (hasValidCoordinates) {

    navigationUrl =
      "https://www.google.com/maps/dir/" +
      "?api=1" +
      "&travelmode=driving" +
      `&destination=${encodeURIComponent(
        `${numericLatitude},${numericLongitude}`
      )}`;

  } else {

    const safeAddress =
      String(
        address || ""
      ).trim();

    if (!safeAddress) {

      alert(
        "Navigation location is not available."
      );

      return;

    }

    navigationUrl =
      "https://www.google.com/maps/search/" +
      "?api=1" +
      `&query=${encodeURIComponent(
        safeAddress
      )}`;
  }

  window.open(
    navigationUrl,
    "_blank"
  );

}

// ===============================
// INITIALIZE GOOGLE ROUTES
// ===============================

async function initializeGoogleRoutes() {

  try {

    if (
      !window.google?.maps?.importLibrary
    ) {
      throw new Error(
        "Google Maps loader is not available."
      );
    }

    const routesLibrary =
      await google.maps.importLibrary(
        "routes"
      );

    RouteClass =
      routesLibrary.Route;

    console.log(
      "Google Routes library loaded for Rider Panel"
    );

  } catch (error) {

    RouteClass = null;

    console.error(
      "Rider Google Routes initialization failed:",
      error
    );

  }

}

// ===============================
// CALCULATE RIDER ROUTE METRICS
// ===============================

async function calculateRiderRouteMetrics(
  origin,
  destination
) {

  if (!RouteClass) {
    throw new Error(
      "Google Routes library is not ready."
    );
  }

  const originLatitude =
    Number(
      origin?.lat
    );

  const originLongitude =
    Number(
      origin?.lng
    );

  const destinationLatitude =
    Number(
      destination?.lat
    );

  const destinationLongitude =
    Number(
      destination?.lng
    );

  const validOrigin =
    Number.isFinite(
      originLatitude
    ) &&
    Number.isFinite(
      originLongitude
    ) &&
    originLatitude >= -90 &&
    originLatitude <= 90 &&
    originLongitude >= -180 &&
    originLongitude <= 180;

  const validDestination =
    Number.isFinite(
      destinationLatitude
    ) &&
    Number.isFinite(
      destinationLongitude
    ) &&
    destinationLatitude >= -90 &&
    destinationLatitude <= 90 &&
    destinationLongitude >= -180 &&
    destinationLongitude <= 180;

  if (
    !validOrigin ||
    !validDestination
  ) {
    throw new Error(
      "Valid rider route coordinates are required."
    );
  }

  const response =
    await RouteClass.computeRoutes({
      origin: {
        lat:
          originLatitude,

        lng:
          originLongitude
      },

      destination: {
        lat:
          destinationLatitude,

        lng:
          destinationLongitude
      },

      travelMode:
        "DRIVING",

      routingPreference:
        "TRAFFIC_AWARE",

      computeAlternativeRoutes:
        false,

      fields: [
        "distanceMeters",
        "durationMillis"
      ]
    });

  const route =
    response.routes?.[0];

  if (!route) {
    throw new Error(
      "Google did not return a rider route."
    );
  }

  const distanceMeters =
    Number(
      route.distanceMeters
    );

  const durationMillis =
    Number(
      route.durationMillis
    );

  if (
    !Number.isFinite(
      distanceMeters
    ) ||
    distanceMeters < 0
  ) {
    throw new Error(
      "Valid remaining distance was not received."
    );
  }

  return {
    distanceKm:
      Number(
        (
          distanceMeters /
          1000
        ).toFixed(2)
      ),

    durationMinutes:
      Number.isFinite(
        durationMillis
      )
        ? Math.max(
            1,
            Math.ceil(
              durationMillis /
              60000
            )
          )
        : null
  };

}

// ===============================
// ENABLE ALERTS ON FIRST INTERACTION
// ===============================

async function enableAlertsOnFirstInteraction() {

  console.log(
    "Rider first interaction detected"
  );

  if (riderAlertEnabled) {
    return;
  }

  await enableRiderAlerts();

}

document.addEventListener(
  "pointerdown",
  enableAlertsOnFirstInteraction,
  {
    once: true
  }
);

// ===============================
// INITIALIZE RIDER ROUTES
// ===============================

initializeGoogleRoutes();

document.addEventListener(
  "keydown",
  enableAlertsOnFirstInteraction,
  {
    once: true
  }
);