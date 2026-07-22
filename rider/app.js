const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";


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

  clearRiderLogin();

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

function showDashboard() {

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

          const activeStatus =
            booking.status ===
              "Assigned" ||

            booking.status ===
              "Picked Up" ||

            booking.status ===
              "Out for Delivery";

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

          const bookingId =
            escapeHtml(
              booking.bookingId
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
                    '${bookingId}',
                    'Picked Up'
                  )
                "
                ${
                  booking.status ===
                  "Assigned"
                    ? ""
                    : "disabled"
                }
              >
                Mark Picked Up
              </button>

              <button
                class="status-button"
                type="button"
                onclick="
                  updateStatus(
                    '${bookingId}',
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
                    '${bookingId}',
                    'Delivered'
                  )
                "
                ${
                  booking.status ===
                  "Out for Delivery"
                    ? ""
                    : "disabled"
                }
              >
                Mark Delivered
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

    await loadDeliveries();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to update delivery status."
    );

  }

}
