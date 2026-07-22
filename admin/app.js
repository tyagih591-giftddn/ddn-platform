const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

const LOGIN_API =
  "https://ddn-platform.onrender.com/api/auth/login";


// ===============================
// ADMIN LOGIN
// ===============================

const loginForm =
  document.getElementById("loginForm");

loginForm.addEventListener(
  "submit",
  async function (e) {

    e.preventDefault();

    const username =
      document
        .getElementById("adminUsername")
        .value
        .trim();

    const password =
      document
        .getElementById("adminPassword")
        .value;

    const loginMessage =
      document.getElementById("loginMessage");

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
            role: "admin"

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

      localStorage.setItem(
        "ddnAdminLoggedIn",
        "true"
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

  loadBookings();
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
        "ddnAdminLoggedIn"
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

if (
  localStorage.getItem(
    "ddnAdminLoggedIn"
  ) === "true"
) {

  showDashboard();

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

  try {

    const response =
      await fetch(API_URL);

    if (!response.ok) {

      throw new Error(
        "Unable to load bookings"
      );

    }

    const data =
      await response.json();

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

    container.innerHTML =
      "<p>Unable to connect to DDN backend.</p>";

  }

}


// ===============================
// ASSIGN RIDER
// ===============================

async function assignRider(
  bookingId
) {

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
              "application/json"

          },

          body: JSON.stringify({

            rider

          })

        }

      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Rider assignment failed"
      );

    }

    alert(
      `Rider "${rider}" assigned successfully!`
    );

    loadBookings();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to assign rider."
    );

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
              "application/json"

          },

          body: JSON.stringify({

            status:
              newStatus

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
      "Booking status updated successfully!"
    );

    loadBookings();

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Unable to update booking status."
    );

    select.disabled = false;

  }

}
