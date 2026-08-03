const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";

const RIDER_LOCATION_API =
  "https://ddn-platform.onrender.com/api/rider/location";

  const SOCKET_URL =
  "https://ddn-platform.onrender.com";

let riderSocket = null;

let riderLocationInterval = null;

let riderAlertAudio = null;
let riderAlertEnabled = false;

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

  showDashboard();

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

    container.innerHTML =
      deliveries.map(
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

              <h3>
                ${bookingId}
              </h3>

              <p>
                <strong>
                  Assigned Rider:
                </strong>

                ${escapeHtml(
                  booking.assignedRider
                )}
              </p>

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

<div class="navigation-buttons">

  <button
    class="status-button"
    type="button"
    onclick="
      openPickupNavigation(
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

  <button
    class="status-button"
    type="button"
    onclick="
      openDeliveryNavigation(
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

</div>

              <p>
                <strong>
                  Status:
                </strong>

                <span class="status">
                  ${escapeHtml(
                    booking.status
                  )}
                </span>
              </p>

              <button
                class="status-button"
                type="button"
                onclick="
                  updateStatus(
                    '${rawBookingId}',
                    'Accepted'
                  )
                "
                ${
                  booking.status ===
                  "Assigned"
                    ? ""
                    : "disabled"
                }
              >
                Accept Delivery
              </button>

              ${
                booking.status ===
                "Accepted"
                  ? `

                    <div class="proof-section">

                      <p>
                        <strong>
                          Pickup Proof Photo:
                        </strong>
                      </p>

                      <input
                        id="pickup-photo-${rawBookingId}"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                      >

                      <br><br>

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

              <button
                class="status-button"
                type="button"
                onclick="
                  updateStatus(
                    '${rawBookingId}',
                    'Out for Delivery'
                  )
                "
                ${
                  booking.status ===
                  "Picked Up"
                    ? ""
                    : "disabled"
                }
              >
                Out for Delivery
              </button>

              <button
                class="status-button"
                type="button"
                onclick="
                  updateStatus(
                    '${rawBookingId}',
                    'Reached Drop Location'
                  )
                "
                ${
                  booking.status ===
                  "Out for Delivery"
                    ? ""
                    : "disabled"
                }
              >
                Reached Drop Location
              </button>

              ${
                booking.status ===
                "Reached Drop Location"
                  ? `

                    <div class="proof-section">

                      <p>
                        <strong>
                          Delivery Proof Photo:
                        </strong>
                      </p>

                      <input
                        id="delivery-photo-${rawBookingId}"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                      >

                      <br><br>

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

async function sendRiderLocation() {

  const token = getRiderToken();

  if (!token) {
    return;
  }

  try {

    const location =
      await getCurrentLocation();

    await fetch(
      RIDER_LOCATION_API,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude
        })
      }
    );

  } catch (error) {

    console.error(
      "Location Update Error:",
      error
    );

  }

}

function startLiveLocationTracking() {

  if (riderLocationInterval) {
    clearInterval(
      riderLocationInterval
    );
  }

  sendRiderLocation();

  riderLocationInterval =
    setInterval(
      sendRiderLocation,
      15000
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

function openPickupNavigation(
  latitude,
  longitude,
  address
) {

  if (
    latitude &&
    longitude &&
    latitude !== "null" &&
    longitude !== "null"
  ) {

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      "_blank"
    );

    return;

  }

  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank"
  );

}

function openDeliveryNavigation(
  latitude,
  longitude,
  address
) {

  if (
    latitude &&
    longitude &&
    latitude !== "null" &&
    longitude !== "null"
  ) {

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      "_blank"
    );

    return;

  }

  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank"
  );

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

document.addEventListener(
  "keydown",
  enableAlertsOnFirstInteraction,
  {
    once: true
  }
);