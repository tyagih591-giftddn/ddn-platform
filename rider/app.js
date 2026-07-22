const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";


// ===============================
// RIDER LOGIN
// ===============================

const loginForm =
  document.getElementById("loginForm");

loginForm.addEventListener(
  "submit",
  async function (e) {

    e.preventDefault();

    const username =
      document
        .getElementById("riderUsername")
        .value
        .trim();

    const password =
      document
        .getElementById("riderPassword")
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
        await fetch(LOGIN_API, {

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

        });

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

      // Rider login और username save करें
      localStorage.setItem(
        "ddnRiderLoggedIn",
        "true"
      );

      localStorage.setItem(
        "ddnRiderUsername",
        username
      );

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

  document
    .getElementById("loginSection")
    .style.display =
    "none";

  document
    .getElementById("dashboardSection")
    .style.display =
    "block";

  loadDeliveries();
}


// ===============================
// LOGOUT
// ===============================

document
  .getElementById("logoutButton")
  .addEventListener(
    "click",
    function () {

      localStorage.removeItem(
        "ddnRiderLoggedIn"
      );

      localStorage.removeItem(
        "ddnRiderUsername"
      );

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

    }
  );


// ===============================
// CHECK LOGIN
// ===============================

const savedLogin =
  localStorage.getItem(
    "ddnRiderLoggedIn"
  );

const savedRiderUsername =
  localStorage.getItem(
    "ddnRiderUsername"
  );

if (
  savedLogin === "true" &&
  savedRiderUsername
) {

  showDashboard();

} else {

  localStorage.removeItem(
    "ddnRiderLoggedIn"
  );

  localStorage.removeItem(
    "ddnRiderUsername"
  );

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

  if (!riderUsername) {

    container.innerHTML =
      "<p>Please logout and login again.</p>";

    return;
  }

  try {

    const response =
      await fetch(API_URL);

    if (!response.ok) {

      throw new Error(
        "Unable to load deliveries"
      );

    }

    const data =
      await response.json();

    const bookings =
      data.bookings || [];

    // केवल login किए हुए rider की bookings
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
          No deliveries assigned to
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
        booking => `

          <div class="delivery">

            <h3>
              ${escapeHtml(
                booking.bookingId
              )}
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
              onclick="
                updateStatus(
                  '${escapeHtml(
                    booking.bookingId
                  )}',
                  'Picked Up'
                )
              "
            >
              Mark Picked Up
            </button>

            <button
              class="status-button"
              onclick="
                updateStatus(
                  '${escapeHtml(
                    booking.bookingId
                  )}',
                  'Out for Delivery'
                )
              "
            >
              Out for Delivery
            </button>

            <button
              class="status-button"
              onclick="
                updateStatus(
                  '${escapeHtml(
                    booking.bookingId
                  )}',
                  'Delivered'
                )
              "
            >
              Mark Delivered
            </button>

          </div>

        `

      ).join("");

  } catch (error) {

    console.error(error);

    container.innerHTML =
      "<p>Unable to connect to DDN backend.</p>";

  }

}


// ===============================
// UPDATE DELIVERY STATUS
// ===============================

async function updateStatus(
  bookingId,
  newStatus
) {

  try {

    const response =
      await fetch(

        `${API_URL}/${bookingId}/status`,

        {

          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            status: newStatus
          })

        }

      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Status update failed"
      );

    }

    alert(
      "Status updated successfully!"
    );

    loadDeliveries();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to update delivery status."
    );

  }

}
